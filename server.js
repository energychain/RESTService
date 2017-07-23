'use strict';

const Hapi = require('hapi');
var StromDAOBO = require('stromdao-businessobject');
const startStopDaemon = require('start-stop-daemon');
var xmlrpc = require('xmlrpc')
var rpc="http://localhost:8540/rpc";
var cntR=0;


 var options = {
    outFile: 'restservice.out.log',   
    errFile: 'restservice.err.log',
    max: 1 //the script will run 3 times at most 
 };
 
const node= new StromDAOBO.Node({external_id:"node",testMode:true});

const cors= {
			origin: ['*'],
			additionalHeaders: ['cache-control', 'x-requested-with']
};

var cache={};

const boAccess=function(extid, path,next) {
				var account=extid;
				var shift=1;
				cntR++;
				
				var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});
				var r=path.split("/");
				if(r.length<5) reply("ERROR");
				 
				var r_class=r[2];
				var r_address=r[3];
				var r_method=r[4];
				
				var cargs=[];
				if(r_address!="0x0") cargs.push(r_address);				
				
				var margs=[];
				
				for(var i=4+shift;i<r.length;i++) {
						margs.push(r[i]);
				}
				node[r_class].apply(this,cargs).then(function(x) {					
							x[r_method].apply(this,margs).then(function(res) {
									next(null,JSON.stringify(res),node);					
							}).catch(next(null,JSON.stringify({status:error}),node));					
				});	
};
	
const populateObject=function(server) {
		var node= new StromDAOBO.Node({external_id:'1337',rpc:rpc,testMode:true});
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
							
							var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});					
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
		server.route({
			method:  ['GET','POST'],
			path: '/api/cold/get/{args*}',		
			config: { auth: 'jwt',cors:cors },
			handler:  requestColdStorageGet
		});	
		server.route({
			method:  ['GET','POST'],
			path: '/api/cold/set/{args*}',		
			config: { auth: 'jwt',cors:cors },
			handler: requestColdStorageSet
		});	

	}	

const loginHandler=function(request,reply)  {
	var extid="";
	if((typeof request.payload=="undefined")||(request.payload==null)||(request.payload.extid==null)) {
		extid=request.params.extid;
	} else {
		extid=request.payload.extid;
	}
	var extsecret=Math.random();
	if((request.payload==null)||(typeof request.payload.secret=="undefined")) {
		extsecret=request.params.secret;
	} else {
		extsecret=request.payload.secret;
	}
	
	var node= new StromDAOBO.Node({external_id:"node",rpc:rpc,testMode:true});
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

const validate = function (decoded, request, callback) {
	request.extid=decoded.id;
	console.log(decoded);
	return callback(null, true);
		  
};

const requestColdStorageSet=function(request,reply) {
	var account=request.extid;
	var bucket=Math.random();
	var obj="";
	if((request.payload==null)||(typeof request.payload.bucket=="undefined")) {
		bucket=request.query.bucket;
		obj=request.query.obj;
	} else {
		bucket=request.payload.bucket;
		obj=request.payload.obj;
	}	
	var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});		
	node.storage.setItemSync(node.wallet.address+"_"+bucket,obj);		
	reply(JSON.stringify({address:node.wallet.address,bucket:bucket,data:obj}));
}

const requestColdStorageGet=function(request,reply) {
	var account=request.extid;
	var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});
	var req="";
	var bucket="";		
	if((request.payload==null)||(typeof request.payload.bucket=="undefined")) {
		bucket=request.query.bucket;
		req=request.query.account;
	}
	var obj=node.storage.getItemSync(req+"_"+bucket);		
	reply(JSON.stringify({address:req,bucket:bucket,data:obj}));
}



const boCache=function(obj,next) {
		var cachhit=false;
			
		if((typeof cache[obj.id] !="undefined")) {
			cachhit=true;
			var item = cache[obj.id];
			
			if(item.expires<new Date().getTime()) cachhit=false;
				
			if(cachhit) next(cache[obj.id].obj);	
		}
		var rendstart = new Date().getTime();
			
		if(!cachhit) {
					boAccess(obj.account,obj.path,function(e,r,o) {
						console.log("NO Cache",obj.id);							
						var rendend=new Date().getTime();
						// in case of a transaction we invalidate caches..
					
						var cacheitem={};
						cacheitem.expires=rendend+(60000);
						cacheitem.created=rendend;
						cacheitem.obj=r;
						cache[obj.id]=cacheitem;
						o=undefined;
						next(r);					
					});
		}		
};

const requestHandlerOld=function(request,reply) {
	var account=request.extid;
	var path=request.path;
	if(typeof path == "undefined") path="";
	
	const id = account + ':' + path;
	boCache({ id: id, account: account, path: path }, reply);
	if(cntR>5) {
		
		server.stop({ timeout: 1000 }).then(function (err) {
			process.exit(0);
			//server.start();			
		 });
		 process.exit(0);
		 cache={};
		 cntR=0;
		 //StromDAOBO = require('stromdao-businessobject');
	}
}
const requestHandler=function(request,reply) {
	var account=request.extid;
	var shift=1;
	
	var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});
	var r=request.path.split("/");
	if(r.length<5) reply("ERROR");
	 
	var r_class=r[2];
	var r_address=r[3];
	var r_method=r[4];
	
	var cargs=[];
	if(r_address!="0x0") cargs.push(r_address);				
	
	var margs=[];
	
	for(var i=4+shift;i<r.length;i++) {
			margs.push(r[i]);
	}
	node[r_class].apply(this,cargs).then(function(x) {					
				x[r_method].apply(this,margs).then(function(res) {
						reply(JSON.stringify(res));					
				}).catch(reply(JSON.stringify({status:error})));					
	});			
}

startStopDaemon(options, function() {

	var cache={};
	

        

        

	const populateTarifService=function(server) {
		
		server.route({
			method: ['GET','POST'],
			path: '/prices/{plz}/{ja}',
			config: { auth: 'jwt',cors:cors },
			handler:   function(request,reply)  {
						var node= new StromDAOBO.Node({external_id:"node",rpc:rpc,testMode:true});	
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

	


	const server = new Hapi.Server({		
			  connections: {
					routes: {
						timeout: {
							server: 25000 
						}
					}
				}		
	});
	server.connection({ port: 3000, host: 'localhost'});
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
		var node= new StromDAOBO.Node({external_id:"node",rpc:rpc,testMode:true});
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
