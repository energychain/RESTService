'use strict';

const Hapi = require('hapi');
const StromDAOBO = require('stromdao-businessobject');
const startStopDaemon = require('start-stop-daemon');
var xmlrpc = require('xmlrpc')

 var options = {
    outFile: 'restservice.out.log',   
    errFile: 'restservice.err.log',
    max: 2 //the script will run 3 times at most 
 };
 
var node= new StromDAOBO.Node({external_id:"node",testMode:true});


startStopDaemon(options, function() {
	 var cors= {
			origin: ['*'],
			additionalHeaders: ['cache-control', 'x-requested-with']
		};
        
	function loginHandler(request,reply)  {
		var extid="";
		if(typeof request.payload.extid=="undefined") {
			extid=request.params.extid;
		} else {
			extid=request.payload.extid;
		}
		var extsecret=Math.random();
		if(typeof request.payload.secret=="undefined") {
			extsecret=request.params.secret;
		} else {
			extsecret=request.payload.secret;
		}
		
		var node= new StromDAOBO.Node({external_id:"node",testMode:true});
		var secret=node.nodeWallet.address;		
		var res={};				
		if(node.storage.getItemSync("jwt_"+extid)!=null) {
					res.state="load";
					if(node.storage.getItemSync("jwt_"+extid)!= extsecret) {
						var JWT   = require('jsonwebtoken');
						var obj   = { id:'demo' }; // object/info you want to sign						
						
						res.token = JWT.sign(obj, secret);										
						res.auth =	"demo";
						
						reply(JSON.stringify(res));
						return;
					}
		} else {
			res.state="create";
		}
		node.storage.setItemSync("jwt_"+extid,extsecret);
		var JWT   = require('jsonwebtoken');
		var obj   = { id:extid }; // object/info you want to sign
			
		
		res.token = JWT.sign(obj, secret);	
		res.auth = "secret";
										
		reply(JSON.stringify(res));
	};
	
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

	function populateTarifService(server) {
		
		server.route({
			method: ['GET','POST'],
			path: '/prices/{plz}/{ja}',
			config: { auth: 'jwt',cors:cors },
			handler:   function(request,reply)  {
						var node= new StromDAOBO.Node({external_id:"node",testMode:true});	
						var cliOps = {
									host: 'kleinerracker.brandseven.com',
									port: 443,
									path: '/productprices-xmlrpc',
									basic_auth: {
										user: node.storage.getItemSync("sev_user"),
										pass: node.storage.getItemSync("sev_pass"),
									}
						};
						
						var client = xmlrpc.createSecureClient(cliOps);		
						client.methodCall('EnergyPricesProxy.productPricesByProductCode', ["PP_dynamisch_eingeschr_3",'efa81030fce62d7761232bd26b9f16a8cc9dc753a2662ebe6ab535f8fc5e7e957',request.params.plz,request.params.ja*1,'','c3ec23a16304f8d6c8692dcac2343c05'], 
							function (error, value) {    	
								var json=JSON.stringify(value.PP_dynamisch_eingeschr_3);													
								reply(json);								
						});
						
					}
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
					method: ['GET','POST'],
					path: '/api/'+names[i]+'/{args*}',
					config: { auth: 'jwt',cors:cors },
					handler: requestHandler
				});		
				
				console.log("Populated",'/'+names[i]+'/');
			}
		}
		server.route({
			method: ['GET','POST'],
			path: '/api/info/{extid}',
			config: { auth: 'jwt',cors:cors },
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
			method: ['GET'],
			path: '/api/auth/{extid}/{secret}',		
			config: { auth: false,cors:cors },
			handler:  loginHandler
		});	
		server.route({
			method: ['POST'],
			path: '/api/auth',		
			config: { auth: false,cors:cors },
			handler:  loginHandler
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
		populateTarifService(server);
		
	});



	server.start((err) => {

		if (err) {
			throw err;
		}
		console.log(`Server running at: ${server.info.uri}`);
	});

});
