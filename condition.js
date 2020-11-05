var result = false;
var consul = 'http://127.0.0.1:8500/v1/kv';
var headers = [{ 'key': 'Content', 'value': 'application/json' }];
var contentType = 'application/json'
var attKey = "global";

//var distinguishedName = claims.user.ag.distinguishedName // 
var distinguishedName = "CN=813ff95653504d9381e2a0b23cef0419,CN=admin,OU=local"; 
var baseKey= distinguishedName.substr(3,32); 
//var baseKey = "813ff95653504d9381e2a0b23cef0419"
var pathKey = "/" + baseKey + "/" + attKey 
console.log("pathK" + pathKey +"; ") 


// ------ Writer: put value (condition 1)
var putResponse 
try {
  putResponse = httpPut(consul + pathKey , "some useful payload, json or single val.", contentType)
}catch(err) {
  console.log("connection issues:" + err.message);
  return false;
}
if (!putResponse){
   console.log("issue with the put request.")
   return false;
}

if (!putResponse.data){
	console.log("error: could not put kv to consul, request failed.")
  	return false;
}
if (putResponse.data != "true" ){
	console.log("there was an error putting kv to consul")
  	return false;
}
console.log("value stored.")

// ------ Reader: get value (condition 2)
var response = httpGet(consul + pathKey, headers);

if (response.statusCode != 200) {
        console.log(response.data);
        return false;
};
var jdata;
try {
  jdata = JSON.parse(response.data);
}
catch (err) {
    console.log("JSON could not parse response.data:" + response.data + ";");
    return false;
}
var value;
// print content
// ex: [{"LockIndex":0,"Key":"813ff95653504d9381e2a0b23cef0419/global","Flags":0,"Value":"c29tZSB1c2VmdWwgcGF5bG9hZCwganNvbiBvciBzaW5nbGUgdmFsLg==","CreateIndex":9,"ModifyIndex":869}]
//console.log(JSON.stringify(jdata));

try {
  value = atob(jdata[0]["Value"]);
  console.log("value read from kv store:'"+value+"'")
}
catch (err) {
    console.log("could not decode from base64" + value+ ";");
    return false;
}
return false

