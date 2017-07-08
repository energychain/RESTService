'use strict';

const Hapi = require('hapi');
const StromDAOBO = require('stromdao-businessobject');

var validate = function (decoded, request, callback) {
	request.extid=decoded.id;
	console.log(decoded);
	return callback(null, true);
          
};



function requestHandler(request,reply) {
	var account=request.extid;
	var shift=1;
	
	var node= new StromDAOBO.Node({external_id:account,testMode:true});
	var r=request.path.split("/");
	if(r.length<5) reply("ERROR");
	 
	var r_class=r[2];
	var r_address=r[3];
	var r_method=r[4];
	
	var cargs=[];
	if(r_address!="0x0") cargs.push(r_address);
	
	console.log("Class:",r_class,"At:",r_address,"For:",account,"Method:",r_method);
	
	var margs=[];
	
	for(var i=4+shift;i<r.length;i++) {
			margs.push(r[i]);
	}
	node[r_class].apply(this,cargs).then(function(x) {
				//reply("DONE");
				console.log(margs);
				
				x[r_method].apply(this,margs).then(function(res) {
						reply(JSON.stringify(res));					
				});
				
	});			
}


function populateObject(server) {
	var node= new StromDAOBO.Node({external_id:account,testMode:true});
	var names=Object.getOwnPropertyNames(node);
	var html="";
	for(var i=0;i<names.length;i++) {
		if(names[i].indexOf('_')) {
			var active_class=names[i];	
			
			server.route({
				method: 'GET',
				path: '/api/'+names[i]+'/{args*}',
				config: { auth: 'jwt' },
				handler: requestHandler
			});		
			
			console.log("Populated",'/'+names[i]+'/');
		}
	}
	server.route({
		method: 'GET',
		path: '/api/info/{extid}',
		config: { auth: 'jwt' },
		handler:   function(request,reply)  {
						var account="1337";
						if(typeof request.params.extid != "undefined") {
							account=request.params.extid;
						}
						
						var node= new StromDAOBO.Node({external_id:account,testMode:true});					
						reply(JSON.stringify(node.wallet.address));
				}
	});		
	server.route({
		method: 'GET',
		path: '/api/auth/{extid}',		
		config: { auth: false },
		handler:   function(request,reply)  {
						var node= new StromDAOBO.Node({external_id:"node",testMode:true});
						var secret=node.nodeWallet.address;						;
						var JWT   = require('jsonwebtoken');
						var obj   = { id:request.params.extid }; // object/info you want to sign
						var token = JWT.sign(obj, secret);										
						reply(JSON.stringify(token));
				}
	});		
}


const server = new Hapi.Server();
server.connection({ port: 3000, host: 'localhost' });
var account="1337";
server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
        reply('StromDAO BO - REST API v0.0.0.0.0.0.0.0.1');
    }
});

server.register(require('hapi-auth-jwt2'), function (err) {

    if(err){
      console.log(err);
    }
	var node= new StromDAOBO.Node({external_id:"node",testMode:true});
	var secret=node.nodeWallet.address;
	
    server.auth.strategy('jwt', 'jwt',
    { key: secret,         
      validateFunc: validate,            // validate function defined above
      verifyOptions: { algorithms: [ 'HS256' ] } // pick a strong algorithm
    });

    server.auth.default('jwt');

    var account="1337"; 

	populateObject(server);
});



server.start((err) => {

    if (err) {
        throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});
