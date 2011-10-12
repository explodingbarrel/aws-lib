exports.init = function (genericAWSClient) {
  var createEMRClient = function (accessKeyId, secretAccessKey, options) {
    options = options || {};
    return emrClient({
      host: options.host || "elasticmapreduce.amazonaws.com",
      path: options.path || "/",
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      secure: true,
      version: options.version
    });
  };
  var emrClient = function (obj) {
    var aws = genericAWSClient({
      host: obj.host,
      path: obj.path,
      accessKeyId: obj.accessKeyId,
      secretAccessKey: obj.secretAccessKey,
      secure: obj.secure,
      signHeader: false
    });
    obj.call = function(action, query, callback) {
      query["Action"] = action
      return aws.call(action, query, callback);
    }
    return obj;
  };
  return createEMRClient;
};
