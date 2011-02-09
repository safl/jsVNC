// requires hobs.js

/*
 
 Interface:
 
 vnc.connect()
 vnc.disconnect()
 
 vnc.refresh()
 
 vnc.server_info
 vnc.state
 vnc.onstatechange
 
*/
function Vnc(o) {
  
    // Default values
    if( !o ) o = {};
    if( o.vnc_host == undefined ) o.vnc_host = 'jsvnc-01';
    if( o.vnc_port == undefined ) o.vnc_port = '59000';
    
    if( o.ws_host == undefined ) o.ws_host = 'mifcho-01';
    if( o.ws_port == undefined ) o.ws_port = '8000';
    
    if( o.ws_peerid == undefined ) o.ws_peerid = '';
      
    if( o.agent == undefined ) o.agent = 'ANY';
    
    // GUI bindings
    if( o.log == undefined ) o.log = function (msg) {
        var date = new Date();
        document.getElementById("log").innerHTML = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds()+','+date.getMilliseconds()+' LIB - '+msg+'\n' +document.getElementById("log").innerHTML;
    }
    if (o.ctx_id == undefined ) o.ctx_id = 'vnc_canvas';
    if (o.fc_id == undefined ) o.fc_id = 'frame_container';
    
    var self    = this;
    self.rfb    = new Rfb();
    
    // VNC states
    var CONNECTING          = 0;
    var HANDSHAKE           = 100;
    var HANDSHAKE_VER       = 110;
    var HANDSHAKE_SEC       = 120;  
    var HANDSHAKE_SEC_RES   = 140;
    var HANDSHAKE_SRV_INIT  = 150;
    var CONNECTED           = 200;
    var CONNECTED_RECV_FB   = 210;
    var DISCONNECTED        = 300;
    
    var ENCODINGS = [0, 1, -239, -223]; // RAW, copy-rect, pseudo-cursor, pseudo-desktop-size
    
    self.state  = DISCONNECTED;
    
    // Framebuffer dimensions, servername and some other stuff
    self.server_info = {width:      800,  height:       600,  bpp:        0,
                        depth:      0,  big_endian:   0,  true_color: 0,
                        red_max:    0,  green_max:    0,  blue_max:   0,
                        red_shift:  0,  green_shift:  0,  blue_shift: 0,
                        name:       '', scaled:       0,  ver: '',
                        bytes_sent:0, bytes_recv:0};
    
    function pixel_format(bpp, depth, big_endian, true_color,
                          red_max, green_max, blue_max,
                          red_shift, green_shift, blue_shift) {
      
        return {
            bpp: bpp, depth:depth,
            big_endian:big_endian, true_color:true_color,
            red_max:red_max, green_max:green_max, blue_max:blue_max,
            red_shift:red_shift, green_shift:green_shift, blue_shift:blue_shift
        };
      
    }
    
    var msg_type = -1;
    var num_r = -1;
    var cur_r = 0;
    var rect = { x: 0, y: 0, w: 0, h: 0, rect_encoding: -1000 };
    
    var Mouse = { x:0, y:0, pressed:false, button:0  };
    
    self.buffer       = '';
    self.processing   = false;
    
    self.ctx    = null;
    self.canvas = null;
    
    // Assign options to vnc-function...
    for (param in o) { self[param] = o[param]; }
    
    // Wrap around communication library
    self.disconnect = function () {
        self.log('Disconnecting...');
        self.ws.close();
    };
    
    self.connect    = function () {
        
        self.state = CONNECTING;
        setTimeout(self.onstatechange, 0, self.state);
        
        if ("WebSocket" in window) {
        //if (false) {
            self.log('Using Websocket transport.'+'ws://'+self.ws_host+':'+self.ws_port+'/wsocket/'+self.vnc_host+'/'+self.vnc_port+'/'+self.ws_peerid);
            self.ws = new WebSocket('ws://'+self.ws_host+':'+self.ws_port+'/wsocket/'+self.vnc_host+'/'+self.vnc_port+'/'+self.ws_peerid);
        } else {
            self.log('Using Hobs transport.'+'http://'+self.ws_host+':'+self.ws_port+'/hobs/'+self.vnc_host+'/'+self.vnc_port+'/'+self.ws_peerid);
            self.ws = new Hobs('http://'+self.ws_host+':'+self.ws_port+'/hobs/'+self.vnc_host+'/'+self.vnc_port+'/'+self.ws_peerid);
        }
        
        self.log('waiting on websocket');
        
        self.ws.onopen = function() {
            self.state = HANDSHAKE;
            setTimeout(self.onstatechange, 0, self.state);
        };
        
        self.ws.onclose = function() {
            self.state = DISCONNECTED;
            setTimeout(self.onstatechange, 0, self.state);
        };
        
        // Do something with incoming data!
        self.ws.onmessage = function(event) {
          
            self.bytes_recv += event.data.length;
            self.buffer += $.base64Decode( event.data );
                  
            if (!self.processing) {
                process_buffer();
            }      
      
        }
      
    }
    
    self.onstatechange = function () { };   // For the user of the vnc-client.
    
    // Initializes the canvas context
    function init_canvas(width, height) {
    
        self.log('Attempting to init canvas '+width+' '+height);
        
        self.canvas         = document.getElementById(self.ctx_id);
        self.canvas.width   = width;
        self.canvas.height  = height;
        self.ctx            = document.getElementById(self.ctx_id).getContext('2d');
        
        self.ctx.fillStyle = 'rgb(0, 75, 225)';      
        self.ctx.fillRect(0,0, width, height);
    
    }
    
    //init_canvas(800, 600);
    
    function init_input () {    // Register event-handlers
    
                                // Mouse-events
        self.canvas.oncontextmenu    = function () { return false; }
        self.canvas.onmousedown      = function (event) { mouse_click_handler(event); };
        self.canvas.onmouseup        = function (event) { mouse_click_handler(event); };
        self.canvas.onmousemove      = function (event) { mouse_move_handler(event); };
        
                                // Keyboard events
        window.onkeydown    = function (event) { key_handler(event); };
        window.onkeyup      = function (event) { key_handler(event); };
        
    }
    
    // Handle mouse movement by sending pointerEvent
    function mouse_move_handler(event) {
        
        Mouse.x = event.pageX - self.canvas.offsetLeft;
        Mouse.y = event.pageY - self.canvas.offsetTop;
        
        if (self.server_info.scaled == 1) {
            Mouse.x = parseInt((self.server_info.width/$('#frame_container canvas').width())*Mouse.x);
            Mouse.y = parseInt((self.server_info.height/$('#frame_container canvas').height())*Mouse.y)
        }
        
        self.ws.send($.base64Encode(
            self.rfb.pointerEvent(Mouse.x, Mouse.y, Mouse.pressed, Mouse.button)                                
        ));
    }
    
    // Handle mouse-click events by sending pointerEvent
    function mouse_click_handler(event) {
    
        Mouse.button = event.which;
        if (event.type == 'mouseup') {
            Mouse.pressed = false;
        } else {
            Mouse.pressed = true;
        }
        
        self.ws.send($.base64Encode(
            self.rfb.pointerEvent(Mouse.x, Mouse.y, Mouse.pressed, Mouse.button)                                
        ));
      
    }
    
    // Handle key-strokes by sending keyEvent
    function key_handler(event) {
          
        var pressed = true;
        var key_sym = event.which;
        
        if (event.which in self.rfb.key_map) {
            key_sym = self.rfb.key_map[event.which];
        } else {
            key_sym = String.fromCharCode(event.which).toLowerCase().charCodeAt(0);
        }
        if (event.type == 'keyup') {
            pressed = false;
        }
        
        self.ws.send($.base64Encode(
            self.rfb.keyEvent(key_sym, pressed)
        ));
      
    }  
        
    // It will attempt to read "size" bytes from the input-buffer,
    // if the buffer does not have a "size" bytes available
    // empty string is returned.
    //
    // Note: non-blocking
    function read(size) {
      
        var data = '';
        if (self.buffer.length >= size) {
            data   = self.buffer.slice(0, size);
            self.buffer = self.buffer.slice(size, self.buffer.length);
        }
        return data;
      
    }
    
    var sec_types = new Array();
    
    // RFB-protocol implementation.
    //
    // Recursively process data in the input-buffer, execution is driven by
    // the current state represented in "self.state" and the length of the
    // input-buffer: "self.buffer.length".
    //
    function process_buffer() {
      
        if (!self.processing) {
            self.processing = true;
        }
        
        if ((self.state == HANDSHAKE) && (self.buffer.length >= 12)) {
          
            var rfb_ver = read(12);
            var msg = $.base64Encode('RFB 003.008\n');
            self.ws.send( msg );
            self.server_info.bytes_sent += msg.length;
            self.log('RFB VER'+rfb_ver);
            self.state = HANDSHAKE_SEC;
            setTimeout(self.onstatechange, 0, self.state);
          
        } else if (self.state == HANDSHAKE_SEC) {
      
            // Read security types
            var num_sec = u8_to_num(read(1));
            if (num_sec != 0) {                
                for(var i=1; i<=num_sec; i++) {
                    sec_types.push( u8_to_num(read(1)) );
                }
                self.log('Sectypes'+ num_sec);
            } else {
                // Connection failed
                // TODO: handle a failed connection attempt!
                self.log('Something went wrong... in handshake security');
            }
        
            self.ws.send( $.base64Encode( num_to_u8(1)) ); // Select sec-type None
            self.server_info.bytes_sent++;
            
            self.state = HANDSHAKE_SEC_RES;
            setTimeout(self.onstatechange, 0, self.state);
          
        } else if (self.state == HANDSHAKE_SEC_RES) {
          
            var sec_res = u32_to_num(read(1), read(1), read(1), read(1));
        
            self.log('Sec_res '+ sec_res);
            if (sec_res == 1) { // security response = failed
                // TODO: Handle a failed security response
                self.log('Something went wrong... in handshake security RESULT.');
            }
            
            self.ws.send( $.base64Encode( num_to_u8(0) )); // Send client-init
            self.server_info.bytes_sent++;
            
            self.state = HANDSHAKE_SRV_INIT;
            setTimeout(self.onstatechange, 0, self.state);
          
        } else if ((self.state == HANDSHAKE_SRV_INIT) && (self.buffer.length >= 24)) {
          
            var srv_init_buf = self.buffer.slice(0, 24);
            var name_len = 0;
            
            self.server_info.width  = u16_to_num(srv_init_buf[0], srv_init_buf[1]);
            self.server_info.height = u16_to_num(srv_init_buf[2], srv_init_buf[3]);
        
            self.server_info.bpp          = u8_to_num(srv_init_buf[4]);
            self.server_info.depth        = u8_to_num(srv_init_buf[5]);
            self.server_info.big_endian   = u8_to_num(srv_init_buf[6]);
            self.server_info.true_color   = u8_to_num(srv_init_buf[7]);
            
            self.server_info.red_max      = u16_to_num(srv_init_buf[8], srv_init_buf[9]);
            self.server_info.green_max    = u16_to_num(srv_init_buf[10], srv_init_buf[11]);
            self.server_info.blue_max     = u16_to_num(srv_init_buf[12], srv_init_buf[13]);
            
            self.server_info.red_shift    = u8_to_num(srv_init_buf[14]);
            self.server_info.green_shift  = u8_to_num(srv_init_buf[15]);
            self.server_info.blue_shift   = u8_to_num(srv_init_buf[16]);
            
            name_len = u32_to_num(srv_init_buf[20], srv_init_buf[21], srv_init_buf[22] ,srv_init_buf[23] );
            
            if (self.buffer.length >= 24+name_len) {
            
                read(24);
                self.server_info.name = read(name_len);
                
                // Initialize the canvas context
                init_canvas(self.server_info.width, self.server_info.height);
                init_input();
                
                var msg = '';
                
                msg = $.base64Encode(self.rfb.setPixelFormat(   // Set PixelFormat
                    self.server_info
                ));
                self.server_info.bytes_sent += msg.length;
                self.ws.send( msg );
                        
                msg = $.base64Encode(self.rfb.setEncodings(     // Set Encodings
                    ENCODINGS
                ));
                self.server_info.bytes_sent += msg.length;
                self.ws.send( msg );
                        
                msg = $.base64Encode(   self.rfb.fbur(          // Request framebuffer
                    self.server_info.width,
                    self.server_info.height,
                    0
                ));
                self.server_info.bytes_sent += msg.length;
                self.ws.send( msg );
                
                self.state = CONNECTED;
                
                var server_info_str = '';
                for(key in self.server_info) {
                    server_info_str += key+':'+self.server_info[key];
                }
                
                setTimeout(self.onstatechange, 0, self.state); // Notify onstatechange
              
            }
                  
        } else if ((self.state == CONNECTED) && (msg_type == -1)) { // Determine the message type
          
          msg_type = u8_to_num(read(1));
          process_buffer(); // Continue down the rabbit-hole, immediatly, dont wait for more data!
        
        // 6.5.1 FramebufferUpdate
        } else if ((self.state == CONNECTED) &&
                   (msg_type == 0) &&
                   self.buffer.length >= 15) { // Ensure that buffer has enough data for the message header
          
            // Number of rectangles      
            if (num_r == -1) {
                read(1); // eat the padding-byte
                num_r = u16_to_num(read(1), read(1));
                
                // Request another framebuffer update
                var msg = $.base64Encode( self.rfb.fbur(self.server_info.width, self.server_info.height, 1) );
                self.server_info.bytes_sent += msg.length;          
                self.ws.send( msg );
                //self.log('Incoming rectangles: '+num_r+','+self.buffer.length);
            }
            
            rect = {
                x: u16_to_num(self.buffer[0], self.buffer[1]),
                y: u16_to_num(self.buffer[2], self.buffer[3]),
                w: u16_to_num(self.buffer[4], self.buffer[5]),
                h: u16_to_num(self.buffer[6], self.buffer[7]),
                rect_encoding: u32_to_num(self.buffer[8], self.buffer[9], self.buffer[10], self.buffer[11])
            };
                  
            // RAW encoding
            if (rect.rect_encoding == 0) {
              
                //self.log('RAW Encoding');
                var rectangle_length = rect.w*rect.h *(self.server_info.bpp/8);
                if (self.buffer.length >= rectangle_length+12) {
                
                    var cur_rect_raw = read(12);
                    //self.log('FBUR Draw: '+num_r+','+self.buffer.length+','+rectangle_length+','+self.rfb.enc_map[rect.rect_encoding.toString()]+' '+rect.x+' '+rect.y+' '+rect.w+' '+rect.h);
                    self.rfb.draw_rectangle(rect.x, rect.y, rect.w, rect.h, read(rectangle_length), self.ctx, self.server_info);
                    
                    num_r -= 1;       // decrement rectangle count
                                      // remove rectangle from buffer
                    //self.log('Rectangles: '+num_r+'.');
                    if (num_r == 0) { // no more rectangles
                        num_r       = -1;
                        msg_type    = -1;
                        //self.log('No more rectangles.'+self.buffer.length);
                    }
                    
                    // Continue down the rabbit-hole, immediatly, dont wait for more data!
                    // we already got a bunch!
                    if (self.buffer.length > 0) {
                        process_buffer();
                    }
                  
                }
            // CopyRect
            } else if (rect.rect_encoding == 1) {
                self.log('COPY-RECT');
                
                if (self.buffer.length >= 12+4) {
                    var cur_rect_raw = read(12);
                    var src_x = u16_to_num(read(1), read(1));
                    var src_y = u16_to_num(read(1), read(1));
                    
                    var copied_rect = self.ctx.getImageData(src_x, src_y, rect.w, rect.h);  // Get a rectangle buffer
                    self.ctx.putImageData(copied_rect, rect.x, rect.y);
                    
                    num_r -= 1;
                    //self.log('Rectangles: '+num_r+'.');
                    if (num_r == 0) { // no more rectangles
                        num_r       = -1;
                        msg_type    = -1;
                        //self.log('No more rectangles.'+self.buffer.length);
                    }
                    
                    // Continue down the rabbit-hole, immediatly, dont wait for more data!
                    // we already got a bunch!
                    if (self.buffer.length > 0) {
                        process_buffer();
                    }
                }
              
            // RRE
            } else if (rect.rect_encoding == 2) {
                self.log('RRE - UNSUPPORTED Encoding');
              
            // Hextile
            } else if (rect.rect_encoding == 5) {
                self.log('Hextile - UNSUPPORTED Encoding');
              
            // ZRLE
            } else if (rect.rect_encoding == 16) {
                self.log('ZRLE - UNSUPPORTED Encoding');
              
            // Pseudo-encoding: Cursor
            } else if (rect.rect_encoding == -239) {
                self.log('Pseudo-Encoding: Cursor Partially supported Encoding');
                
                var cursor_pixels_length = rect.w * rect.h * (self.server_info.bpp / 8);
                var bitmask_length = Math.floor((rect.w + 7) / 8) * rect.h;
                
                if (self.buffer.length >= (cursor_pixels_length+bitmask_length+12)) {
                            
                    read(12); // headers
                    
                    // The cursor bitmap is currenly unused.
                    var cursor_pixels_raw = read(cursor_pixels_length);
                    var cursor_image_data = self.ctx.createImageData(rect.h, rect.w);          
                    var bitmask_scanlines = read(bitmask_length);          
                    for(var i=0; i<cursor_pixels_raw.length; i++) {
                        cursor_image_data[i] = u8_to_num(cursor_pixels_raw[i]);
                    }
                  
                    num_r -= 1;
                    if (num_r == 0) { // no more rectangles
                        num_r = -1;
                        msg_type = -1;            
                    }
                    
                    // Continue down the rabbit-hole, immediatly, dont wait for more data!
                    // we already got a bunch!
                    if (self.buffer.length > 0) {
                        process_buffer();
                    }
                
                }
              
            // pseudo-encoding: DesktopSize
            } else if (rect.rect_encoding == -223) {
                self.log('Pseudo-Encoding: DesktopSize');
                
                // Adjust the desktop-size!
                read(12);
                
                self.server_info.width   = rect.w;
                self.server_info.height  = rect.h;
                        
                // Re-Initialize the canvas context
                //$('#'+self.ctx_id).remove();
                init_canvas(self.server_info.width, self.server_info.height);
                init_input();
                
                num_r -= 1;
                if (num_r == 0) { // no more rectangles
                  num_r = -1;
                  msg_type = -1;
                }
                
                // Continue down the rabbit-hole, immediatly, dont wait for more data!
                // we already got a bunch!
                if (self.buffer.length > 0) {
                  process_buffer();
                }
              
            } else {
                self.log('UNKOWN Encoding');
            }
          
        // 6.5.2 SetColourMapEntries
        // When the pixel format uses a “colour map”, this message tells the
        // client that the specified pixel values should be mapped to the given
        // RGB intensities.
        //        
        } else if ((self.state == CONNECTED) && (msg_type == 1)) {
            self.log('SET COLOR-MAP - Unsupported');
            msg_type = -1;
          
        // 6.5.3 Bell
        // Ring a bell on the client if it has one.
        // 1      u8        2   message-type
        //
        } else if ((self.state == CONNECTED) && (msg_type == 2)) {
            self.log('RING MY BELL!');
            msg_type = -1;
          
        // 6.5.4 ServerCutText
        // The server has new ISO 8859-1 (Latin-1) text in its cut buffer.
        // 1      u8        3   message-type
        // 3      _         _   padding
        // 4      u32       _   length
        // length u8 array  _   text
        //
        } else if ((self.state == CONNECTED) && (msg_type == 3)) {
          
            if (self.buffer.length >= 7) {
              
                var text_length = u32_to_num(self.buffer[3],
                                             self.buffer[4],
                                             self.buffer[5],
                                             self.buffer[6]);
                
                if (self.buffer.length >= 7+text_length) {
                    var cut_text = '';
                    for(var i=0; i<text_length; i++) {
                        cut_text += self.buffer[7+i];
                    }
                    
                    self.log('Server CutText: ['+ cut_text+']');
                    read(7+text_length);        
                    msg_type = -1;
                }
            }
          
        } else {
            //self.log('No matching case, state='+self.state+', msg_type='+msg_type+', buff_l='+self.buffer.length+'.');
        }
        
        self.processing = false;
      
    }
    
    // Explicitly send a framebufferUpdateRequest
    self.refresh = function() {
        var msg = $.base64Encode(self.rfb.fbur(
            self.server_info.width,
            self.server_info.height,
            0
        ));
        self.ws.send( msg );
        self.server_info.bytes_sent += msg.length;
    }
    
    self.overlay_text = function (text) {
        
        var min_width = 350;
        
        var text_width = self.ctx.measureText(text).width;
        if (text_width < min_width) {
            text_width = min_width;
        }

        var x = Math.floor((self.server_info.width - text_width)/2);
        var y = Math.floor(self.server_info.height/2)
        
        self.ctx.shadowOffsetX   = 2;
        self.ctx.shadowOffsetY   = 2;
        self.ctx.shadowBlur      = 2;
        self.ctx.shadowColor     = "rgba(0, 0, 0, 0.5)";
        self.ctx.font            = "36px Verdana";
        
        self.ctx.fillStyle = 'rgb(0, 50, 150)';
        self.ctx.fillRect (x-20, y-50, text_width, 80);
       
        self.ctx.fillStyle = 'Black';
        self.ctx.fillText(text, x, y);
        
    }
    
    init_canvas(self.server_info.width, self.server_info.height);

}

function Rfb() {
    
    var self = this;
    
    // GUI bindings
    this.log = function (msg) {
        var date = new Date();
        document.getElementById("log").innerHTML = date.getHours()+':'+date.getMinutes()+':'+date.getSeconds()+','+date.getMilliseconds()+': '+msg+'\n' +document.getElementById("log").innerHTML;
    }
    
    // Client to server messages
    this.std_encodings = [0, 1, 2, 5, 16, -239, -223];
    this.enc_map = {'0': 'RAW', '1': 'COPY-RECT', '2':'..', '5':'...', '16':'..', '-239':'Pseudo1', '-223':'Pseudo2'};
    
    this.key_map = {8: 0xff08,  // Backspace
                    9: 0xff09,  // Tab
                    13: 0xff0d, // Return / Enter
                    27: 0xff1b, // Escape
                    45: 0xff63, // Insert
                    46: 0xffff, // Delete
                    36: 0xff50, // Home
                    35: 0xff57, // End
                    33: 0xff55, // Page Up
                    34: 0xff56, // Page Down
                    37: 0xff51, // Left
                    38: 0xff52, // Up
                    39: 0xff53, // Right
                    40: 0xff54, // Down
                    112: 0xffbe,  // F1
                    113: 0xffbf,  // F2
                    113: 0xffc0,  // ...
                    114: 0xffc1,
                    115: 0xffc2,
                    116: 0xffc3,
                    117: 0xffc4,
                    118: 0xffc5,
                    119: 0xffc6,
                    120: 0xffc7,
                    121: 0xffc8,  // ...
                    122: 0xffc9,  // F12
                    16: 0xffe1,   // Shift Left
                    'shiftr': 0xffe2, // Shift right
                    17: 0xffe3,  // Ctrl Left
                    'ctrlr': 0xffe4,  // Ctrl Right
                    'metal': 0xffe7,  // Meta Left
                    'metar': 0xffe8,  // Meta Right
                    18: 0xffe9,       // Alt Left
                    'altr': 0xffea,
                    'slash': 0x2f, // Slash "/"
                    188: 0x2c,     // Comma ","
                    190: 0x2e      // Period "."
                    };  // Alt Right
    
    this.button_map = {1:1, 2:2, 3:4, 4:8, 5:16, 6:32, 7:64, 8:128};
    
    // 6.4.1 - SetPixelFormat
    // todo: implement...
    this.setPixelFormat = function(pixel_format) {
      
        var r = num_to_u8(0);
            r += num_to_u8(1)+num_to_u8(1)+num_to_u8(1); // padding
            r += num_to_u8(pixel_format['bpp']);
            r += num_to_u8(pixel_format['depth']);
            r += num_to_u8(pixel_format['big_endian']);
            r += num_to_u8(pixel_format['true_color']);
            
            r += num_to_u16(pixel_format['red_max']);
            r += num_to_u16(pixel_format['green_max']);
            r += num_to_u16(pixel_format['blue_max']);
            
            r += num_to_u8(pixel_format['red_shift']);
            r += num_to_u8(pixel_format['green_shift']);
            r += num_to_u8(pixel_format['blue_shift']);
            r += num_to_u8(1)+num_to_u8(1)+num_to_u8(1); // padding
            
        return r;
    }
    
    // 6.4.2 - SetEncodings
    this.setEncodings = function(encodings) {
      
        var r = num_to_u8(2);   // message-type
            r += num_to_u8(1);  // padding
            r += num_to_u16(encodings.length);
            
        for(var i=0; i<encodings.length; i++) {
            r += num_to_u32(encodings[i]);
        }
        
        return r;
      
    }
    
    // 6.4.3 - FramebufferUpdateRequest
    this.fbur = function(w, h, inc) {
      
        var r =   num_to_u8(3);
            r +=  num_to_u8(inc);
            r +=  num_to_u16(0);
            r +=  num_to_u16(0);
            r +=  num_to_u16(w);
            r +=  num_to_u16(h);
        
        return r;
    }
    
    // 6.4.4 - KeyEvent
    this.keyEvent = function(key, pressed) {
      
        var r =   num_to_u8(4);
            r +=  num_to_u8(pressed);
            r +=  num_to_u16(0); // padding
            r +=  num_to_u32(key);
        
        return r;
    }
    
    // 6.4.5 - PointerEvent
    this.pointerEvent = function(x, y, pressed, button) {
      
        var button_mask = 0;
        if (pressed) {
            button_mask = this.button_map[button];
        }
        
        var r =   num_to_u8(5);
            r +=  num_to_u8(button_mask);
            r +=  num_to_u16(x);
            r +=  num_to_u16(y);
        
        return r;
    }
    
    // 6.4.6 - ClientCutText
    // TODO: implement
    this.clientCutText = function() {}
    
    // Helper functions
    
    //
    // draw_rectangle - Draws a rectangle of raw-encoded pixel-data
    //
    // @param w int Width of the rectangle
    // @param h int Height of the rectangle
    // @param x int Horizontal start position on the virtual_fb
    // @param y int Vertical start position on the virtual_fb
    // @param data array of pixel values in raw-encoding
    // @param ctx A working 2d-canvas-context
    //
    // @requires data.length = w * h * (bpp / 8)
    //
    this.draw_rectangle = function(r_x, r_y, w, h, pixel_array, ctx, server_info) {
    
        // What it basicly does is to change the BGR representation to RGB....
        // and ignore the alpha channel... it could probably be optimized with
        // in-space operations instead calling getImageData...
        
        var r_buffer  = ctx.createImageData(w, h);  // Get a rectangle buffer    
        var alpha_val = 255;
        var bytes_per_pixel = server_info.bpp / 8;
        
        for(var i=0; i<(w*h*4);i+=4) {        
            
            // RBUFFER ordering:
            // RGB
            
            if (bytes_per_pixel == 4) {         // Reorder BGR to RGB
                
                r_buffer.data[i]   = pixel_array[i+2].charCodeAt(0);
                r_buffer.data[i+1] = pixel_array[i+1].charCodeAt(0);
                r_buffer.data[i+2] = pixel_array[i].charCodeAt(0);
                
                r_buffer.data[i+3] = alpha_val;
              
            } else if (bytes_per_pixel == 3) {         // Reorder BGR to RGB
                
                r_buffer.data[i]   = pixel_array[i/bytes_per_pixel+2].charCodeAt(0);
                r_buffer.data[i+1] = pixel_array[i/bytes_per_pixel+1].charCodeAt(0);
                r_buffer.data[i+2] = pixel_array[i/bytes_per_pixel].charCodeAt(0);
                
                r_buffer.data[i+3] = alpha_val;
                
            } else if (bytes_per_pixel == 2) {
                
                // TODO: fix the color-shifting, current implementation just
                // grayscales...
                
                r_buffer.data[i]    = pixel_array[i/bytes_per_pixel+1].charCodeAt(0);
                r_buffer.data[i+2]  = pixel_array[i/bytes_per_pixel+1].charCodeAt(0);
                r_buffer.data[i+1]  = pixel_array[i/bytes_per_pixel+1].charCodeAt(0);
                
                r_buffer.data[i+3]   = alpha_val;      
                
            }
          
        }
        
        ctx.putImageData(r_buffer, r_x, r_y);                 // Draw it
    
    }

}
