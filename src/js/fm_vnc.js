// Fault-Mitigating VNC
// Wraps around VNC and handles disconnections.
function FMVnc(o) {
        
    var self = this;
    
    var vnc_host    = o.vnc_host;
    var vnc_port    = o.vnc_port;
    var ws_peerid   = o.ws_peerid
    
    var nodes   = o.nodes;    
    var ns  = nodes.length;
    var n   = 0;
    
    var vnc = null;
    
    var attempt_reconnect       = true;
    var reconnection_attempts   = 0;
    var max_attempts = ns * 3;  // Give up after all nodes have been tried tree times
    
    function wrap_vnc() {
        
        vnc = new Vnc({
            vnc_host: vnc_host,
            vnc_port: vnc_port,
            ws_host:  nodes[n%ns].host,
            ws_port:  nodes[n%ns].port,
            ws_peerid: ws_peerid
        });
        
        self.state          = vnc.state;
        self.ctx            = vnc.ctx;
        self.server_info    = vnc.server_info;
        self.overlay_text   = vnc.overlay_text;
        vnc.onstatechange   = self.proxied_onstatechange;
        
    }
    
    self.log = function (msg) {
        var date = new Date();
        document.getElementById("log").innerHTML = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds()+','+date.getMilliseconds()+' FM - '+msg+'\n' +document.getElementById("log").innerHTML;        
    }
    
    self.connect = function () {
        self.attempt_reconnect = true;
        vnc.connect();
    }
        
    self.disconnect = function () {
        self.attempt_reconnect = false;
        vnc.disconnect();        
    }
    
    self.onstatechange  = function (state) {}
    
    self.proxied_onstatechange = function (state) {
        
        if (state == 0) {
            // Reset recon-attempts
            reconnection_attempts = 0;
            setTimeout(self.onstatechange, 0, state);
            
        } else if ((state > 0) && (state < 100)) {
            setTimeout(self.onstatechange, 0, state);
            
        } else if ((state >= 100) && (state <200)) {
            setTimeout(self.onstatechange, 0, state);
            
        } else if ((state >= 200) && (state < 300)) {
            setTimeout(self.onstatechange, 0, state);
    
        } else if (state == 300) {
            
            vnc.disconnect();
            
            if (self.attempt_reconnect && (reconnection_attempts < max_attempts)) {
                self.log('Attempting to reconnect... '+reconnection_attempts);
                reconnection_attempts = attempt_reconnect + 1;
                n = n + 1;
                wrap_vnc();
                setTimeout(vnc.connect, 2000);
            } else {
                setTimeout(self.onstatechange, 0, state);
            }

        } else {
            
            setTimeout(self.onstatechange, 0, state);
            
        }
        
    }
    
    wrap_vnc();
    

}