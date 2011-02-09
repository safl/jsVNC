//
// Hobs provides a websocket-compatible interface for
// bidrectional communication in javacript.
//
// It utilizes websockets if available and falls back to utilizing
// XmlHTTPRequest in a way similar to the
// "BOSH Technique" (http://xmpp.org/extensions/xep-0124.html#technique).
//
// Hobs is named as an anagram after BOSH since it is inspired by the
// the technique, it is however far from a bosh-implementation...
// it is different... comet-thingy... smaller... almost hobbit-like...
//

/* UTILITY FUNCTIONS: url parsing, num-to-binary and binary-to-num */

// Could be fun to implement something like the python struct library...
// Anyway this is sufficient
function num_to_u8(w)   { return String.fromCharCode(w&255); };
function num_to_u16(w)  { return String.fromCharCode((w>>8)&255, w&255); };
function num_to_u32(w)  { return String.fromCharCode((w>>24)&255, (w>>16)&255, (w>>8)&255, w&255); };

function u8_to_num(w)               { return w.charCodeAt(0); };
function u16_to_num(w1, w2)         { return (w1.charCodeAt(0)<<8)  + w2.charCodeAt(0); };
function u32_to_num(w1, w2, w3, w4) { return (w1.charCodeAt(0)<<24) + (w2.charCodeAt(0)<<16)+(w3.charCodeAt(0)<<8)+w4.charCodeAt(0); }

// parseUri 1.2.2
// (c) Steven Levithan <stevenlevithan.com>
// MIT License
function parseUri (str) {
  var	o   = parseUri.options,
      m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
      uri = {},
      i   = 14;

  while (i--) uri[o.key[i]] = m[i] || "";

  uri[o.q.name] = {};
  uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
    if ($1) uri[o.q.name][$1] = $2;
  });

  return uri;
};

parseUri.options = {
  strictMode: false,
  key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
  q:   {
    name:   "queryKey",
    parser: /(?:^|&)([^&=]*)=?([^&]*)/g
  },
  parser: {
    strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
    loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
  }
};

function Hobs(url) {
  
  // Hobs / Websocket interface
  this.url  = parseUri(url);
    
  var Session = parseArgs(this.url);    
  
  var CONNECTING  = 0;
  var OPEN        = 1;
  var CLOSING     = 2;
  var CLOSED      = 3;
    
  this.readyState     = null;
  this.bufferedAmount = null;
  
  // Network callbacks
  this.onopen     = function () {}
  this.onmessage  = function () {}
  this.onerror    = function () {}
  this.onclose    = function () {}
  
  // Network methods
  this.send   = function (data) {}
  this.close  = function () {}
  
  // Implementation to support the interface above
  // And a bonus-feature: stats on the connection!
  
  this.stats = {
    bytes_recv: 0,  bytes_send: 0,
    frames_recv: 0, frames_send: 0
  }
  
  var self = this // I need a variable i can refer to inside of other objects
                  // referring to this inside of other objects will
                  // access the other objects attributes and methods...
                  // Causing issues inside inside of onreadystatuschange...
                  // It is actually not that bad... reminds me of python...

  // Helper to do xhr fallback
  var createXHR = function () {
      try { return new XMLHttpRequest(); } catch(e) {}
      try { return new ActiveXObject('MSXML3.XMLHTTP'); } catch(e) {}
      try { return new ActiveXObject('MSXML2.XMLHTTP.3.0'); } catch(e) {}
      try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(e) {}
      try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch(e) {}
      throw new Error('Could not find XMLHttpRequest or an alternative.');
  };
  
  var output_queue = new Array();
  var recv_buffer = '';
    
  connect(); // Connect!
  
  // Queues data when a send is currently in progress or the state is opening
  self.send = function (data, check) {
    
    // We only try to send when hobs says that the game has begun!
    if (self.readyState == OPEN || self.readyState == CONNECTING) {
    
      // Buffer the send, connection is NOT ready
      if ((Session.sending == 1) || self.readyState == CONNECTING) {
        output_queue.push(data);
        
      // Send the data, connection is ready
      } else {
        Session.sending = 1;
        q_send(data)
      }
    
    } else {
      // TODO: fire some sort of error thing...
    }
  }
  
  self.close = function () {
    
    // No sense in closing a closed connection...
    if ((self.readyState == OPEN) || (self.readyState == CONNECTING)) {
      self.readyState = CLOSING;
      setTimeout(self.onclose, 0);
      self.readyState = CLOSED;
    }
  }
  
  // Helper for "instantiating" hubs.
  function connect () {
    
    self.readyState = CONNECTING;
    
    var xhr = createXHR();
    
    // Create the request-identifier offset
    Session.request_id = generate_rid();
    
    xhr.open('GET', self.url.protocol+'://'+self.url.host+':'+self.url.port+'/'+Session.prefix+'/create/'+Session.request_id+'/'+Session.wait+'/'+Session.endpoint_host+'/'+Session.endpoint_port+'/'+Session.peer_id);
    
    xhr.onreadystatechange = function(event) {
                        
      if (xhr.readyState == 4) {
        
        // Update stats
        self.stats.bytes_recv   += xhr.responseText.length
        self.stats.frames_recv  += 1
        
        // Successful handshake
        if (xhr.status == 200) {
          
          // Grab headers and update session information
          
          Session.id = xhr.responseText;
          $('#messages').append('[SID='+Session.id+']');
          
          self.readyState = OPEN;
          setTimeout(self.onopen, 0);
          setTimeout(recvLoop, 0);
          setTimeout(input_worker, 0);
          
        } else {
          self.readyState = CLOSED;
        }
        
      }
      
    }
    xhr.send();
    
  }
  
  // Helper for generating request identifiers
  function generate_rid() {
    return Math.ceil(Math.random() * 10000000000);
  }
  
  // Parses /hej:123/med:321/dig:666 to {'hej': 123, 'med': 321, 'dig': 666}
  function parseNamedArgs(url) {
    
    var pairs = url.path.split('/');
    var args  = {};
        
    for(var i=0; i< pairs.length; i++) {
      var pair = pairs[i].split(':',2);
      args[pair[0]] = pair[1];
    }
    
    return args;
    
  }
  
  function parseArgs(url) {
        
    var prefix  = '';    
    var ep_host = '';
    var ep_port = 0;
    var peer_id = '';
    var args = url.path.split('/');
    
    if (args.length == 4) {
        
        prefix  = args[1];
      
        ep_host = args[2];
        ep_port = args[3];
        
    } else if (args.length == 5) {
        
        prefix  = args[1];        
        ep_host = args[2];
        ep_port = args[3];
        peer_id = args[4];
        
    } else {
        // something bad happened
    }
    
    return {
        id:         0,
        request_id: 0,
        sending:    0,
        wait:           50,
        prefix:         prefix,        
        endpoint_host:  ep_host,
        endpoint_port:  ep_port,
        peer_id:        peer_id
    };
    
  }
  
  // Helper for outgoing data, used by send()
  function q_send(data) {
  
    Session.request_id += 1;
    
    var xhr = createXHR();
    
    xhr.open('POST', self.url.protocol+'://'+self.url.host+':'+self.url.port+'/'+Session.prefix+'/session/'+Session.id+'/'+Session.request_id);
    xhr.setRequestHeader("Content-Type", "text/plain");
    
    xhr.onreadystatechange = function(event) {
            
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          
          // Check if more stuff has arrived... can I do this here?? hmmm
          if (output_queue.length>0) {
            var more_data = '';
            for(var i=0; i<output_queue.length; i++) {
              more_data += output_queue.shift();
            }
            
            q_send(more_data); // Send it
          } else {
            Session.sending = 0;
          }
        
        // Something went wrong so the connection will be closed
        } else {
          self.close();
        }
      }
      
    }
    xhr.send(data);
    
    // Update stats
    self.stats.bytes_send  += data.length;
    self.stats.frames_send += 1
    
  }
  
  function input_worker() {
    
    if (recv_buffer.length>0) {
      self.onmessage({data:recv_buffer});
      recv_buffer = '';
    }
    setTimeout(input_worker, 1);
  }
  
  // Helper for maintaining incoming data, used by connect
  function recvLoop() {
    
    var xhr = createXHR();  
        
    xhr.open('GET', self.url.protocol+'://'+self.url.host+':'+self.url.port+'/hobs/session/'+Session.id);
    xhr.onreadystatechange = function(event) {
      
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          
          // Do not trigger onmessage with empty responses, these are keep-alive
          if (xhr.responseText.length > 0) {
            recv_buffer += xhr.responseText;
          } 
          
          // Should I do it again?
          if (self.readyState == OPEN) {
            setTimeout(recvLoop, 0);
          } else {
            self.close();
          }
          
          // Update stats
          self.stats.bytes_recv  += xhr.responseText.length
          self.stats.frames_recv += 1
        
        // Something went wrong so the connection will be closed
        } else {
          self.close();
        }
      }
      
    }
    
    xhr.send();
  
  }
  
}