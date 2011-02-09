/*
 The VNCGui requires the following DOM-elements:
 
    The following identifiers are used for the framebuffer canvas.
    
    #frame_container
    #vnc_canvas
    
    The following classes are used for visualizing various information:
    
    .server_info:
        .hostname
        .resolution
        .bpp
        .depth
        .big_endian
        .truecolor
        .red_max
        .green_max
        .blue_max
        .red_shift
        .green_shift
        .blue_shift
        
    .conn_info:
        .bytes_send
        .bytes_recv
        .msgs_send
        .msgs_recv
        .status
        
    The following identifiers and classes will be bound to gui-actions:
    #panel
    
 
*/
function VNCGui(nodes) {
    
    var default_info = {
        width:      800,    height:       600,  bpp:        0,
        depth:      0,      big_endian:   0,    true_color: 0,
        red_max:    0,      green_max:    0,    blue_max:   0,
        red_shift:  0,      green_shift:  0,    blue_shift: 0,
        name:       'Unknown',     scaled:       0,    ver: '',
        bytes_sent:0, bytes_recv:0
    };
    var server_info     = default_info;
    var vnc             = null;
    
    var ctx_id      = 'vnc_canvas';
    var canvas_id   = 'fb_container';
    
    var self = this;
    
    self.pinned = false;
    self.scaled = false;
    
    self.log = function (msg) {
        var date = new Date();
        document.getElementById("log").innerHTML = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds()+','+date.getMilliseconds()+' GUI - '+msg+'\n' +document.getElementById("log").innerHTML;        
    }
    
    self.set_info = function (info) {
        server_info = info;
        
        $('.server_info .hostname').html(server_info.name);
        $('.server_info .resolution').html(server_info.width+'x'+server_info.height);
        $('.server_info .bpp').html(server_info.bpp);
        $('.server_info .depth').html(server_info.depth);
        $('.server_info .big_endian').html(server_info.big_endian);
        $('.server_info .truecolor').html(server_info.true_color);
        $('.server_info .red_max').html(server_info.red_max);
        $('.server_info .green_max').html(server_info.green_max)
        $('.server_info .blue_max').html(server_info.blue_max);
        $('.server_info .red_shift').html(server_info.red_shift);
        $('.server_info .green_shift').html(server_info.green_shift);
        $('.server_info .blue_shift').html(server_info.blue_shift);
    }
    
    self.reset_info = function () {
        self.set_info(default_info);
    }
    
    self.set_conn_info = function(status_text, remove, add, button_text, overlay_text, state) {
        self.log(status_text+' '+state);
        $('.conn_info .status').html(status_text);
        $('div.conn_info').removeClass(remove).addClass(add);
        $('#connection').html(button_text);
        vnc.overlay_text(overlay_text);
    }
    
    self.pin = function () {
        
        self.pinned = self.pinned ^1;
        
        if ($('#panel').hasClass('unpinned')) {
            $('#panel').removeClass('unpinned');
            $('#panel').removeClass('hidden');
            $('#pin').removeClass('unpin').addClass('pin');
        } else {
            $('#panel').addClass('unpinned');
            $('#panel').addClass('hidden');
            $('#pin').removeClass('pin').addClass('unpin');
        }          
        
    }
    
    self.scale = function () {
        
        if (vnc) {
            
            var w = 0;
            var h = 0;
            
            self.scaled = self.scaled^1;            // Toggle scaling
                    
            if (self.scaled == 1) {                 // Determine width and height
                w = $(window).width();      
                h = $(window).height();
            } else {
                w = vnc.server_info.width;
                h = vnc.server_info.height;
            }
            
            $('#frame_container canvas').width(w);  // Perform the actual scaling
            $('#frame_container canvas').height(h);
            
            vnc.server_info.scaled = self.scaled;
            
        } else {
            self.log('ERR: Badly timed scaling, probably not connected.')
        }
    }
    
    self.refresh    = function () {
        
        if (vnc && (vnc.state >= 200) && (vnc.state < 300)) {
            vnc.refresh();    
        } else {
            self.log('ERR: Badly timed scaling, probably not connected.')
        }
    
    }
    
    self.connect = function () {
        
        if (vnc && (vnc.state >= 0) && (vnc.state < 300)) {
            self.log("DIS while connected!!!");
            vnc.disconnect();
            vnc = null;
            
        } else if (vnc && (vnc.state == 300)) {
            self.log("DIS while DISconnected?");
            vnc.disconnect();
            vnc = null;
        } else {
            self.log("Connecting...");
            vnc = null;
            
            self.bind_vnc();
            vnc.connect();
        }
    }
    
    self.bind_vnc = function () {
        
        vnc = new FMVnc({
            vnc_host: $('#vnc_host').val(),
            vnc_port: $('#vnc_port').val(),
            ws_host:  $('#ws_host').val(),
            ws_port:  $('#ws_port').val(),
            ws_peerid: $('#ws_peerid').val(),
            nodes: nodes
        });  
        
        vnc.onstatechange = function (state) {
            
            if (state == 0) {
                
                self.set_conn_info('Connecting', 'disconnected', 'connected', 'Abort', 'Please Wait.', state);
                
            } else if ((state > 0) && (state < 100)) {
                
                self.set_conn_info('Connecting', 'disconnected', 'connected', 'Abort', 'Please Wait..', state);
                
            } else if ((state >= 100) && (state <200)) {
                
                self.set_conn_info('Handshaking', 'disconnected', 'connected', 'Abort', 'Please Wait...', state);
                
            } else if ((state >= 200) && (state < 300)) {
                
                self.set_conn_info('Connected', 'disconnected', 'connected', 'Disconnect', 'Please Wait....', state);                
                self.set_info(vnc.server_info);
                
            } else if (state == 300) {
                
                self.set_conn_info('Disconnected', 'connected', 'disconnected', 'Connect', 'Please Wait.....', state);            
                self.reset_info();
                
            } else {
                
                self.log('ERROR UNKNOWN STATE! '+state);
                $('.conn_info .status').html('Unknown');
                
            }
            
        }
      
    }
    
    /* GUI buttons */
    $('#pin').click( self.pin );        
    $('#refresh').click( self.refresh );
    $('#scale').click( self.scale );                    
    $('#connection').click( self.connect );
    
}
