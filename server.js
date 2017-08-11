'use strict';
const Hapi = require('hapi');
var StromDAOBO = require('stromdao-businessobject');
const startStopDaemon = require('start-stop-daemon');
var xmlrpc = require('xmlrpc')
var rpc="http://localhost:8540/rpc";
var cntR=0;


const IPFS = require("ipfs");

const cors= {
			origin: ['*'],
			additionalHeaders: ['cache-control', 'x-requested-with']
};
const nats_enabled = function() {
	

	if(typeof process.env.NATS !="undefined") {
		var arg_servers=process.env.NATS.split(",");
		var servers= [];
		for(var i=0;i<arg_servers.length;i++) {
				servers.push(arg_servers[i]);
		}
		var nats= NATS.connect({servers:servers});	
		var node_persist = require('node-persist');
			
		console.log("Using NATS");
		nats.subscribe('query',  function(request, replyTo) {
				console.log("NATS Query: ",request);
				if(node_persist.getItemSync(request)!=null) {
						nats.publish(replyTo, node_persist.getItemSync(request));
				}
		});

		nats.subscribe('set',  function(request, replyTo) {
				console.log("NATS SET: ",request);
				var json=JSON.parse(request);				
				node_persist.setItemSync(json.key,json.value);
		});


		storage_locale = {	
			initSync:function() {node_persist.initSync();},
			getItemSync:function(key) {
				   
					if(node_persist.getItemSync(key)==null) {					
						nats.requestOne('query', key, {}, 500, function(response) {					
						  if(response.code && response.code === NATS.REQ_TIMEOUT) {
							// Timeout Query 
							return;
						  }
						  return response;					  
						});
					}
					
					return node_persist.getItemSync(key);
			},
			setItemSync:function(key,value) {
					nats.publish('set', JSON.stringify({key:key,value:value}));
					return node_persist.setItemSync(key,value);
			}
		};	
	}
}

 var options = {
    outFile: 'restservice.out.log',   
    errFile: 'restservice.err.log',
    max: 1 //the script will run 3 times at most 
 };

const NATS = require('nats');

	var node_persist = require('node-persist');	
	node_persist.initSync();
	
		var storage_locale = {	
			initSync:function() {node_persist.initSync();},
			getItemSync:function(key) {				   					
					return node_persist.getItemSync(key);
			},
			setItemSync:function(key,value) {					
					return node_persist.setItemSync(key,value);
			}
		};		
		



nats_enabled();
const host_node= new StromDAOBO.Node({external_id:"node",rpc:rpc,testMode:true,storage:storage_locale});
		
startStopDaemon(options, function() {



var cache={};


var ipfsinstance={};


const boAccess=function(extid, path,next) {
				var account=extid;
				var shift=1;
				cntR++;
				
				var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});				
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
		var node= new StromDAOBO.Node({external_id:'1337',rpc:rpc,testMode:true,storage:storage_locale});
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
							
							var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});												
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
			path: '/api/priv/get/{args*}',		
			config: { auth: 'jwt',cors:cors },
			handler:  requestPrivStorageGet
		});			
		server.route({
			method:  ['GET','POST'],
			path: '/api/cold/set/{args*}',		
			config: { auth: 'jwt',cors:cors },
			handler: requestColdStorageSet
		});	
		server.route({
			method:  ['GET','POST'],
			path: '/api/priv/set/{args*}',		
			config: { auth: 'jwt',cors:cors },
			handler: requestPrivStorageSet
		});			
		server.route({
			method:  ['GET','POST'],
			path: '/api/gist/set/{args*}',		
			config: { auth: 'jwt',cors:cors },
			handler: requestGistStorage
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
	
	//
	var secret=host_node.nodeWallet.address;		
	var res={};				
	if(host_node.storage.getItemSync("jwt_"+extid)!=null) {
				res.state="load";
				if(host_node.storage.getItemSync("jwt_"+extid)!= extsecret) {
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
	host_node.storage.setItemSync("jwt_"+extid,extsecret);
	var JWT   = require('jsonwebtoken');
	var obj   = { id:extid }; // object/info you want to sign
		
	
	res.token = JWT.sign(obj, secret);	
	res.auth = "secret";
	var node= new StromDAOBO.Node({external_id:extid,rpc:rpc,testMode:true});
	node.stromkontoproxy("0xf2E3FAB8c3A82388EFd9B5fd9F4610509c4855F4").then(function(skp) {
		skp.balancesHaben(node.wallet.address).then(function(haben) {
				res.haben=haben;
				skp.balancesSoll(node.wallet.address).then(function(soll) {
					res.soll=soll;
					reply(JSON.stringify(res));
				});
		});
		
	})								
	
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
	var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});		

	node.storage.setItemSync(node.wallet.address+"_"+bucket,obj);	
	var path=node.wallet.address;
	
	var json=JSON.parse(obj);
	if((json.length>0)&&(typeof json[0].content != "undefined")) {
			var ipfsobj=[];			
			ipfsobj.push({
					path:"/"+node.wallet.address+"/"+bucket+"/base.html",
					content:new Buffer(json[0].content)
			});			
			ipfsobj.push({
					path:"/"+node.wallet.address+"/"+bucket+"/base.js",
					content:new Buffer(json[1].content)
			});
			ipfsobj.push({
					path:"/"+node.wallet.address+"/"+bucket+"/packaged.json",
					content:new Buffer(obj)
			});
			var ipfsAPI = require('ipfs-api');
			var ipfsinstance = ipfsAPI('/ip4/127.0.0.1/tcp/5001');
			ipfsinstance.files.add(ipfsobj, function (err, ipfsfiles) {
					var hash="";
					var root="";
					for(var i=0;i<ipfsfiles.length;i++) {
						if(ipfsfiles[i].path=="/"+path+"/"+bucket+"/packaged.json") {
								hash=ipfsfiles[i].hash;
						}	
						if(ipfsfiles[i].path==path+"/"+bucket) {
								root=ipfsfiles[i].hash;
						}				   
					}
					var obj={}
				    obj.ipfshash = hash;
				    obj.ipfsroot= root;
				    host_node.storage.setItemSync(path+"_"+bucket,obj);
					console.log("IPFS",err,ipfsfiles);
			});
	}
	reply(JSON.stringify({address:node.wallet.address,bucket:bucket,data:obj}));
	node=null;
}

const requestPrivStorageSet=function(request,reply) {
	var account=request.extid;
	var bucket="priv";
	var obj=request.payload.obj;
	
	var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});		
	
	node.storage.setItemSync(node.wallet.address+"_"+bucket,obj);			
	reply(JSON.stringify({address:node.wallet.address,bucket:bucket,data:obj}));
	node=null;
}

const requestGistStorage=function(request,reply) {
	
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
	if(node.options.external_id!=account) {	
		node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});		
	}
   
  
    if((json.length>0)&&(typeof json[0].content != "undefined")) {				
		var GitHub =require('github-api');
		const gh = new GitHub();
		
		let quickgist = gh.getGist(); // not a gist yet 
	
		var gistobj={};
	
		gistobj.description="Fury.Network - Snippet for STROMDAO Energy Blockchain";
		gistobj.public=true;
		gistobj.files={
				"base.html":{
					"content":json[0].content
				},
				"base.js":{
					"content":json[1].content
				},
				"user.json":{
					"content":JSON.stringify({id:account,bucket:bucket})
				}
		}
		console.log(gistobj);
		quickgist.create(gistobj).then( function(data) {
			var res={};
			res.id=data.data.id;
			res.account=account;			
			reply(JSON.stringify(res));
		});		
	} 	
}
const requestPrivStorageGet=function(request,reply) {
	var account=request.extid;
	var sendnote=false;

	var	node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});
	sendnote=true;
	
	var bucket="priv";		

	var obj=node.storage.getItemSync(node.wallet.address+"_"+bucket);	
	var bal =0;
	node.stromkontoproxy("0x19BF166624F485f191d82900a5B7bc22Be569895").then(function(skp) {
		skp.balancesHaben(node.wallet.address).then(function(haben) {
				bal+=haben;
				console.log("BAL",node.wallet.address,haben);
				skp.balancesSoll(node.wallet.address).then(function(soll) {
					bal-=soll;
					reply(JSON.stringify({address:account,payment:node.wallet.address,bucket:bucket,data:obj,balance:bal}));
					node=null;
				});
		});
		
	})			
		
}
const requestColdStorageGet=function(request,reply) {
	var account=request.extid;
	var sendnote=false;
	
	var node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});
		sendnote=true;
	
	var req="";
	var bucket="";		
	if((request.payload==null)||(typeof request.payload.bucket=="undefined")) {
		bucket=request.query.bucket;
		req=request.query.account;
	}
	if(bucket=="priv") { 
		reply(JSON.stringify({address:req,bucket:bucket,data:{}})); 
	} else {
		var obj=node.storage.getItemSync(req+"_"+bucket);		
		var message = { 
			  app_id: "80282eb4-5cb2-4cba-b8a3-158fc66f20b8",
			  contents: {"en": node.options.external_id+" is using "+req},
			  filters: [
					{"field": "tag", "key": req, "relation": "=", "value": "1"}
				]
			};

		if(sendnote) sendNotification(message);
		console.log(obj);
		if(obj==null) {
			reply(JSON.stringify({address:req,bucket:bucket,data:obj}));
		} else {
		var json=obj;	
		if(typeof json.ipfshash!="undefined") {		
			console.log("IPFS Hash",json.ipfshash);		
			var ipfsAPI = require('ipfs-api');
			var ipfsinstance = ipfsAPI('/ip4/127.0.0.1/tcp/5001');
			var data="";
			console.log("/ipfs/"+json.ipfshash);
			ipfsinstance.files.get(json.ipfshash,function (err, stream) {	
				 stream.on('data', function(chunk) {																
						chunk.content.on('data',function(d) {
							data+=d.toString();					
						});
						chunk.content.on('end',function(d) {
							console.log("IPFS Retrieve Packaged",err,data);
							reply(JSON.stringify({address:req,bucket:bucket,data:data,ipfshash:json.ipfshash,ipfsroot:json.ipfsroot}));	
						});
						
												
															
				 });
				 stream.on('finish',function() {
											
				 });
						
			});
			
		} else {
			reply(JSON.stringify({address:req,bucket:bucket,data:obj}));
		}
		}
	}
	node=null;
}




const requestHandler=function(request,reply) {
	var account=request.extid;
	var shift=1;
	
	var	node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true,storage:storage_locale});

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
	node=null;		
}

	//const node= new StromDAOBO.Node({external_id:"node",testMode:true,storage:storage_locale});
	
	require('dotenv').config();

    const populatePaymentService=function(server) {  
		const stripe = require("stripe")(host_node.storage.getItemSync("stripe_secret"));
		console.log("Payment Account",host_node.wallet.address);
		  
		server.route({
			method: ['GET','POST'],
			path: '/payment/',
			config: { cors:cors },
			handler:   function(request,reply)  {
				var token=request.payload.stripeToken;
				
				var charge = stripe.charges.create({
				  amount: request.payload.amount,
				  currency: "eur",
				  description: "Fury.Network access",
				  source: token,
				}, function(err, charge) {
				  var res={};
				  if(charge.paid) {
						console.log("Payment Account",node.wallet.address);
						node.stromkonto("0x19BF166624F485f191d82900a5B7bc22Be569895").then(function(sko) {
							sko.addTx("0x0013ab4e15A14B97D517e75fb7F6f9fF13514e30",request.payload.account,request.payload.amount,0).then(function(tx) {
								res.tx=tx;		
								if(typeof request.payload.redirect	!= "undefined") {
									reply("<script>location.replace='"+request.payload.redirect+"';</script>");
								} else {
									reply(JSON.stringify(res));
								}
							});	
						});					  
				  } else {
						res.error="Failed";
						reply(JSON.stringify(res));
				  }
				  
				});
				/*
				 console.log("Charge CB",token);
				 reply(JSON.stringify(token));
				 */
			}			
		});		
	}    

	const populateTarifService=function(server) {
		
		server.route({
			method: ['GET','POST'],
			path: '/prices/{plz}/{ja}',
			config: { auth: 'jwt',cors:cors },
			handler:   function(request,reply)  {
						//var node= new StromDAOBO.Node({external_id:"node",rpc:rpc,testMode:true});	
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


var sendNotification = function(data) {
  var headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Authorization": "Basic "+host_node.storage.getItemSync("OSKEY")
  };
  
  var options = {
    host: "onesignal.com",
    port: 443,
    path: "/api/v1/notifications",
    method: "POST",
    headers: headers
  };
  
  var https = require('https');
  var req = https.request(options, function(res) {  
    res.on('data', function(data) {
    });
  });
  
  req.on('error', function(e) {
    
  });
  
  req.write(JSON.stringify(data));
  req.end();
};


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
		//var node= new StromDAOBO.Node({external_id:"node",rpc:rpc,testMode:true});
		var secret=host_node.nodeWallet.address;
		
		server.auth.strategy('jwt', 'jwt',
		{ key: secret,         
		  validateFunc: validate,            // validate function defined above
		  verifyOptions: { algorithms: [ 'HS256' ] } // pick a strong algorithm
		});

		server.auth.default('jwt');

		var account="1337"; 

		populateObject(server);
		populateTarifService(server);
		populatePaymentService(server);
		
	});

	
	server.register(require('bell'), function (err) {


    server.auth.strategy('twitter', 'bell', {
        provider: 'twitter',
        password: host_node.wallet.address,
        clientId: process.env.twitter_clientId,
        clientSecret: process.env.twitter_clientSecret,
        isSecure: false     // Terrible idea but required if not using HTTPS especially if developing locally
    });

    server.auth.strategy('dropbox', 'bell', {
        provider: 'dropbox',
        password: host_node.wallet.address,
        clientId: process.env.dropbox_clientId,
        clientSecret: process.env.dropbox_clientSecret,
        location: 'https://fury.network',
        isSecure: true     // Terrible idea but required if not using HTTPS especially if developing locally
    });
    
    server.auth.strategy('github', 'bell', {
        provider: 'github',
        password: host_node.wallet.address,
        clientId: process.env.github_clientId,
        clientSecret: process.env.github_clientSecret,
        location: 'https://fury.network',
        isSecure: true     // Terrible idea but required if not using HTTPS especially if developing locally
    });
    
    server.auth.strategy('google', 'bell', {
        provider: 'google',
        password: host_node.wallet.address,
        clientId: process.env.google_clientId,
        clientSecret: process.env.google_clientSecret,
        location: 'https://fury.network',
        isSecure: true     // Terrible idea but required if not using HTTPS especially if developing locally
    });
    
    server.auth.strategy('linkedin', 'bell', {
        provider: 'linkedin',
        password: host_node.wallet.address,
        clientId: process.env.linkedin_clientId,
        clientSecret: process.env.linkedin_clientSecret,
        location: 'https://fury.network',
        isSecure: true     // Terrible idea but required if not using HTTPS especially if developing locally
    });
    
    server.route({
        method: ['GET', 'POST'], // Must handle both GET and POST
        path: '/api/oauth/linkedin',          // The callback endpoint registered with the provider
        config: {
            auth: 'linkedin',
            handler: function (request, reply) {				
                if (!request.auth.isAuthenticated) {
                    return reply('Authentication failed due to: ' + request.auth.error.message);
                }
                
                var extid = request.auth.credentials.provider+"_"+request.auth.credentials.profile.id;
                
				var JWT   = require('jsonwebtoken');
				var obj   = { id:extid }; // object/info you want to sign
				console.log("OAUTH linkedin",obj.id,extid);	
				var res={};
				res.token = JWT.sign(obj, host_node.nodeWallet.address);									
				return reply.redirect('/?sectoken='+res.token+'&extid='+request.auth.credentials.query.extid+'&inject='+request.auth.credentials.query.inject);
					
            }
        }
    });
    
    server.route({
        method: ['GET', 'POST'], // Must handle both GET and POST
        path: '/api/oauth/google',          // The callback endpoint registered with the provider
        config: {
            auth: 'google',
            handler: function (request, reply) {				
                if (!request.auth.isAuthenticated) {
                    return reply('Authentication failed due to: ' + request.auth.error.message);
                }
                
                var extid = request.auth.credentials.provider+"_"+request.auth.credentials.profile.id;
                
				var JWT   = require('jsonwebtoken');
				var obj   = { id:extid }; // object/info you want to sign
				console.log("OAUTH Google",obj.id,extid);	
				var res={};
				res.token = JWT.sign(obj, host_node.nodeWallet.address);									
				return reply.redirect('/?sectoken='+res.token+'&extid='+request.auth.credentials.query.extid+'&inject='+request.auth.credentials.query.inject);
					
            }
        }
    });
    
    server.route({
        method: ['GET', 'POST'], // Must handle both GET and POST
        path: '/api/oauth/github',          // The callback endpoint registered with the provider
        config: {
            auth: 'github',
            handler: function (request, reply) {				
                if (!request.auth.isAuthenticated) {
                    return reply('Authentication failed due to: ' + request.auth.error.message);
                }
                
                var extid = request.auth.credentials.provider+"_"+request.auth.credentials.profile.id;
                
				var JWT   = require('jsonwebtoken');
				var obj   = { id:extid }; // object/info you want to sign
				console.log("OAUTH Github",obj.id,extid);	
				var res={};
				res.token = JWT.sign(obj, host_node.nodeWallet.address);									
				return reply.redirect('/?sectoken='+res.token+'&extid='+request.auth.credentials.query.extid+'&inject='+request.auth.credentials.query.inject);
					
            }
        }
    });
    

    server.route({
        method: ['GET', 'POST'], // Must handle both GET and POST
        path: '/api/oauth/twitter',          // The callback endpoint registered with the provider
        config: {
            auth: 'twitter',
            handler: function (request, reply) {				
                if (!request.auth.isAuthenticated) {
                    return reply('Authentication failed due to: ' + request.auth.error.message);
                }
                
                var extid = request.auth.credentials.provider+"_"+request.auth.credentials.profile.id;
                
				var JWT   = require('jsonwebtoken');
				var obj   = { id:extid }; // object/info you want to sign
				console.log("OAUTH TWITTER",obj.id,extid);	
				var res={};
				res.token = JWT.sign(obj, host_node.nodeWallet.address);									
				return reply.redirect('/?sectoken='+res.token+'&extid='+request.auth.credentials.query.extid+'&inject='+request.auth.credentials.query.inject);
					
            }
        }
    });
	
	server.route({
	method: ['GET', 'POST'], // Must handle both GET and POST
	path: '/api/oauth/dropbox',          // The callback endpoint registered with the provider
	config: {
		auth: 'dropbox',
		handler: function (request, reply) {			
			if (!request.auth.isAuthenticated) {
				return reply('Authentication failed due to: ' + request.auth.error.message);
			}
			
			var extid = request.auth.credentials.provider+"_"+request.auth.credentials.profile.id;
			
			var JWT   = require('jsonwebtoken');
			var obj   = { id:extid }; // object/info you want to sign
			console.log("OAUTH Dropbox",obj.id,extid);	
			var res={};
			res.token = JWT.sign(obj, host_node.nodeWallet.address);									
			return reply.redirect('/?sectoken='+res.token+'&extid='+request.auth.credentials.query.extid+'&inject='+request.auth.credentials.query.inject);
		}
	}
    });
	});




	server.start((err) => {

		if (err) {
			throw err;
		}
		console.log(`Server running at: ${server.info.uri}`);
		
		//setInterval(function() { server.stop(); server.start(); }, 5000);
	});
	
	
});


