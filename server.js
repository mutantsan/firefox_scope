require('http').createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<h1 style="color:red">Hello</h1><p>para</p>')}).listen(8765);
