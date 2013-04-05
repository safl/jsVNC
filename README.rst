VNC/RFB client implemented in JavaScript
========================================

* NO plugins!
* NO flash-bridges!
* NO java-bridges!

Just you, your browser and communication mediated by .. _mifcho: https://github.com/safl/mifcho!

No releases, yet... but feel free to poke around In the source-code.
And have a look at the [screenshots]! 

Or take a look at these demos:

 * [http://www.youtube.com/watch?v=TocE4MzsD-c demo-video]
 * [http://www.youtube.com/watch?v=kaI52-PZyjg]

Below is a list of how much of the [http://www.realvnc.com/docs/rfbproto.pdf RFB-protocol specification] that jsVNC supports:

+-------+-------------------------------+------+
| 6.1.1 | Handshake - Protocol Version | OK |
| 6.1.2 | Handshake - Security | OK |
| 6.1.3 | Handshake - Security Result | OK |
| 6.2.1 | Security Types - None | OK |
| 6.2.2 | Security Types - VNC Authentification | - |
| 6.3.1 | ClientMessages - ClientInit | OK |
| 6.3.2 | ClientMessages - ServerInit | OK |
| 6.4.1 | ClientMessages - SetPixelFormat | OK |
| 6.4.2 | ClientMessages - SetEncodings | OK |
| 6.4.3 | ClientMessages - FrameBufferUpdateRequest | OK |
| 6.4.4 | ClientMessages - KeyEvent | PARTIAL |
| 6.4.5 | ClientMessages - PointerEvent | OK |
| 6.4.6 | ClientMessages - ClientCutText | - |
| 6.5.1 | ServerMessages - FramebufferUpdate | OK |
| 6.5.2 | ServerMessages - SetColourMapEntries | OK |
| 6.5.3 | ServerMessages - Bell | OK |
| 6.5.4 | ServerMessages - ServerCutText | OK |
| 6.6.1 | Encodings - RAW | OK |
| 6.6.2 | Encodings - CopyRect | OK |
| 6.6.3 | Encodings - RRE | - |
| 6.6.4 | Encodings - Hextile | - |
| 6.6.5 | Encodings - ZRLE | - |
| 6.7.1 | PseudoEncodings - Cursor | OK |
| 6.7.2 | PseudoEncodings - DesktopSize | OK |
+-------+-------------------------------+------+

