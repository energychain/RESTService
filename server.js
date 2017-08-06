'use strict';
const Hapi = require('hapi');
var StromDAOBO = require('stromdao-businessobject');
const startStopDaemon = require('start-stop-daemon');
var xmlrpc = require('xmlrpc')
var rpc="http://localhost:8540/rpc";
var cntR=0;

const IPFS = require("ipfs");


var ipfsinstance={};

 var options = {
    outFile: 'restservice.out.log',   
    errFile: 'restservice.err.log',
    max: 1 //the script will run 3 times at most 
 };
 
var node= new StromDAOBO.Node({external_id:"node",testMode:true});

const cors= {
			origin: ['*'],
			additionalHeaders: ['cache-control', 'x-requested-with']
};

var cache={};

var sendNotification = function(data) {
  var headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Authorization": "Basic "+node.storage.getItemSync("OSKEY")
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
	
	//var node= new StromDAOBO.Node({external_id:"node",rpc:rpc,testMode:true});
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
	if(node.options.external_id!=account) {	
		node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});		
	}
	node.storage.setItemSync(node.wallet.address+"_"+bucket,obj);	
	
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
						if(ipfsfiles[i].path=="/"+node.wallet.address+"/"+bucket+"/packaged.json") {
								hash=ipfsfiles[i].hash;
						}	
						if(ipfsfiles[i].path=="/"+node.wallet.address+"/"+bucket+"/"") {
								root=ipfsfiles[i].hash;
						}				   
					}
					var obj={}
				    obj.ipfshash = hash;
				    obj.ipfsroot= root;
				    node.storage.setItemSync(node.wallet.address+"_"+bucket,obj);
					console.log("IPFS",err,ipfsfiles);
			});
	}
	reply(JSON.stringify({address:node.wallet.address,bucket:bucket,data:obj}));
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
		node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});		
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

const requestColdStorageGet=function(request,reply) {
	var account=request.extid;
	var sendnote=false;
	if(node.options.external_id!=account) {	
		node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});
		sendnote=true;
	}
	var req="";
	var bucket="";		
	if((request.payload==null)||(typeof request.payload.bucket=="undefined")) {
		bucket=request.query.bucket;
		req=request.query.account;
	}
	var obj=node.storage.getItemSync(req+"_"+bucket);		
	var message = { 
		  app_id: "80282eb4-5cb2-4cba-b8a3-158fc66f20b8",
		  contents: {"en": node.options.external_id+" is using "+req},
		  filters: [
				{"field": "tag", "key": req, "relation": "=", "value": "1"}
			]
		};

	if(sendnote) sendNotification(message);
	var json=JSON.parse(obj);
	if(typeof json.ipfshash!="undefined") {		
		console.log("IPFS Hash",json.ipfshash);		
		var ipfsAPI = require('ipfs-api');
		var ipfsinstance = ipfsAPI('/ip4/127.0.0.1/tcp/5001');
		var data="";
		console.log("/ipfs/"+ipfshash);
		ipfsinstance.files.get("/ipfs/"+ipfshash,function (err, stream) {			
			 stream.on('data', function(chunk) {
						data+ = chunk;							
			 });
			 stream.on('close',function() {
					console.log("IPFS Retrieve Packaged",err,data);
					obj=JSON.parse(data);						
					reply(JSON.stringify({address:req,bucket:bucket,data:obj}));						
		     });			
		});
		
	} else {
		reply(JSON.stringify({address:req,bucket:bucket,data:obj}));
	}
	
}




const requestHandler=function(request,reply) {
	var account=request.extid;
	var shift=1;
	console.log("EXTID in Node:",node.options.external_id);
	if(node.options.external_id!=account) {	
		node= new StromDAOBO.Node({external_id:account,rpc:rpc,testMode:true});
	}
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
	

    const populatePaymentService=function(server) {  
		const stripe = require("stripe")(node.storage.getItemSync("stripe_secret"));
		console.log("Payment Account",node.wallet.address);
		  
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
		populatePaymentService(server);
		
	});


	
	
	server.start((err) => {

		if (err) {
			throw err;
		}
		console.log(`Server running at: ${server.info.uri}`);
		
		
	});
	

	
});
