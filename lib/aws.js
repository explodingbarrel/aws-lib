var http = require("http");
var https = require("https");
var qs = require("querystring")
var crypto = require("crypto")
var events = require("events")
var xml2js = require("xml2js")

// include specific API clients
var ec2 = require("./ec2");
var prodAdv = require("./prodAdv");
var simpledb = require("./simpledb");
var sqs = require("./sqs");
var sns = require("./sns");
var ses = require("./ses");
var emr = require("./emr");

// Returns the hmac digest using the SHA256 algorithm.
function hmacSha256(key, toSign) {
  var hash = crypto.createHmac("sha256", key);
  return hash.update(toSign).digest("base64");
}

// a generic AWS API Client which handles the general parts
var genericAWSClient = function(obj) {
  var creds = crypto.createCredentials({});
  if (null == obj.secure)
    obj.secure = true;

  obj.connection = obj.secure ? https : http;
  obj.call = function (action, query, callback) {
    if (obj.secretAccessKey == null || obj.accessKeyId == null) {
      throw("secretAccessKey and accessKeyId must be set")
    }
    
    var doRequest = function(cb) {

	    var now = new Date();
	
		function ISODateString(d) {
		    function pad(n){
		        return n<10 ? '0'+n : n
		    }
		    return d.getUTCFullYear()+'-'
		    + pad(d.getUTCMonth()+1)+'-'
		    + pad(d.getUTCDate())+'T'
		    + pad(d.getUTCHours())+':'
		    + pad(d.getUTCMinutes())+':'
		    + pad(d.getUTCSeconds())+'Z'
		}
	
	    if (!obj.signHeader) {
	      // Add the standard parameters required by all AWS APIs
	      query["AWSAccessKeyId"] = obj.accessKeyId;
		  query["SignatureVersion"]="2";
		  query["SignatureMethod"]="HmacSHA256";
		  query["Timestamp"]=ISODateString(new Date());
	      query["Signature"] = obj.sign(query);
	    }
	
	    var body = qs.stringify(query);
	    var headers = {
	      "Host": obj.host,
	      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
	      "Content-Length": body.length
	    };
	
	    if (obj.signHeader) {
	      headers["Date"] = now.toUTCString();
	      headers["x-amzn-authorization"] =
	      "AWS3-HTTPS " +
	      "AWSAccessKeyId=" + obj.accessKeyId + ", " +
	      "Algorithm=HmacSHA256, " +
	      "Signature=" + hmacSha256(obj.secretAccessKey, now.toUTCString());
	    }
	
	    var options = {
	      host: obj.host,
	      path: obj.path,
	      method: 'POST',
	      headers: headers
	    };

    	var req = obj.connection.request(options, function (res) {
			
			var data = '';

			//the listener that handles the response chunks
			res.setEncoding('utf8');
			res.on('data', function (chunk) {
				data += chunk;
			});
			
			res.on('end', function() {
				if ( res.statusCode !== 200 ) {
					console.log('non-200 status code from aws ' + res.statusCode, data,query,headers);
					return cb(false);
				}
				var parser = new xml2js.Parser();
				parser.addListener('end', function(result) {
					cb(true,result);
				});
				parser.parseString(data);
			});
			
			
	    });
		
		req.on('error', function(err) {
			console.log('AWS Error',err);
			cb(false);
		});
		
	    req.write(body);
	    req.end();		
	};
	

	var success = false;
	
	(function cycle(remainingTries) {
		if (remainingTries>0 && !success) {
			remainingTries--;
						
			doRequest(function(succeeded,result) {
				if (succeeded) {
					return callback(result);					
				}
				else {
					console.log('Error, retrying');
					process.nextTick(function() {
						cycle(remainingTries);			
					});					
				}

			});
		}
		else {
			// ran out of attempts
			console.log('AWS Failed too many times : ' + obj.path);
			return callback();
		}
	})(3);
  }
  /*
   Calculate HMAC signature of the query
   */
  obj.sign = function (query) {

    var keys = []
    var sorted = {}

    for(var key in query) {
    	keys.push(key)
    }
    
    keys = keys.sort();

    console.log('sorted keys: ', keys);
    
    var qsArray = [];
    for(n in keys) {
      var key = keys[n];
      qsArray.push( encodeURIComponent(key) + '=' + encodeURIComponent(query[key]) );
    }
    var stringToSign = ["POST", obj.host, obj.path,qsArray.join('&')].join("\n");

    // Amazon signature algorithm seems to require this
    stringToSign = stringToSign.replace(/!/g,"%21");
    stringToSign = stringToSign.replace(/'/g,"%27");
    stringToSign = stringToSign.replace(/\*/g,"%2A");
    stringToSign = stringToSign.replace(/\(/g,"%28");
    stringToSign = stringToSign.replace(/\)/g,"%29");

    return hmacSha256(obj.secretAccessKey, stringToSign);
  }
  return obj;
}
exports.createEC2Client = ec2.init(genericAWSClient);
exports.createProdAdvClient = prodAdv.init(genericAWSClient);
exports.createSimpleDBClient = simpledb.init(genericAWSClient);
exports.createSQSClient = sqs.init(genericAWSClient);
exports.createSNSClient = sns.init(genericAWSClient);
exports.createSESClient = ses.init(genericAWSClient);
exports.createEMRClient = emr.init(genericAWSClient);
