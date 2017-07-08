'use strict';

const Hapi = require('hapi');
const StromDAOBO = require('stromdao-businessobject');

function requestHandler(request,reply) {
	var account="1337";
	var shift=1;
	
	if(typeof request.params.extid != "undefined") {
		account=request.params.extid;
		shift++;
	}
	
	var node= new StromDAOBO.Node({external_id:account,testMode:true});
	var r=request.path.split("/");
	var r_class=r[1];
	var r_address=r[2+shift];
	var r_method=r[3+shift];
	
	var cargs=[];
	if(r_address!="0x0") cargs.push(r_address);
	
	console.log(r_class,r_address,r_method);
	
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
				path: '/api/'+names[i]+'/{extid}/{args*}',
				handler: requestHandler
			});		
			
			console.log("Populated",'/'+names[i]+'/');
		}
	}
	server.route({
		method: 'GET',
		path: '/api/info/{extid}',
		handler:   function(request,reply)  {
						var account="1337";
						if(typeof request.params.extid != "undefined") {
							account=request.params.extid;
						}
						
						var node= new StromDAOBO.Node({external_id:account,testMode:true});					
						reply(JSON.stringify(node.wallet.address));
				}
	});			
}


const server = new Hapi.Server();
server.connection({ port: 3000, host: 'localhost' });

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
        reply('StromDAO BO - REST API v0.0.0.0.0.0.0.0.1');
    }
});

var account="1337"; 


populateObject(server);

server.start((err) => {

    if (err) {
        throw err;
    }
    console.log(`Server running at: ${server.info.uri}`);
});
