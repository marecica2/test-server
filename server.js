//init
var yetify = require('yetify'), config = require('./dev_config.json'), uuid = require('node-uuid');
var https = require('https');
var fs = require('fs');
var options = {
        key: fs.readFileSync(config.key),
        cert: fs.readFileSync(config.cert)
};

var server = https.createServer(options, function (req, res) {
    res.writeHead(200);
  });
server.listen(config.server.port);
var io = require('socket.io').listen(server, { log: false });


function describeRoom(name) {
    var clients = io.sockets.clients(name);
    var result = {
        clients: {}
    };
    clients.forEach(function (client) {
        result.clients[client.id] = client.resources;
    });
    return result;
}

function safeCb(cb) {
    if (typeof cb === 'function') {
        return cb;
    } else {
        return function () {};
    }
}

// users storage
var users = {};
var chatroom = {};
console.log("Listening on port " + config.server.port);


function getIndexOf(value, collection){
    for(index in collection){
        if(collection[index] == value)
            return index;
    }
    return -1;
}


io.sockets.on('connection', function (client) {
    client.resources = {
            screen: false,
            video: true,
            audio: false
    };
    
    client.on('hangout-send', function (data) {
        var message = data.message;
        if(message != undefined){
            message = message.replace(/</g, '&lt;');
            message = message.replace(/>/g, '&gt;');
        }
        data.message = message;
        io.sockets.to(client.room).emit('hangout-message', data);
    });
    
    client.on('user_joined', function (data) {
        data.id = client.id;
        client.peer = data.peer;
        if(users[data.room] == undefined){
            users[data.room] = [];
        }
        users[data.room].push(data);
        
        //join specific room
        client.room = data.room;
        client.join(data.room);
        
        var us = JSON.stringify(users[data.room]);
        io.sockets.emit('user_update', us);
    });
    
    client.on('user_refresh', function(data){
        var us = JSON.stringify(users);
        io.sockets.emit('user_update', us);        
    });

    client.on('disconnect', function (data) {
        for(var room in users){
            var roomUsers = users[room];
            for(var user in roomUsers){
                if(roomUsers[user].id == client.id || roomUsers[user].peer == client.id){
                    roomUsers.splice(user, 1);
                    if(roomUsers.length == 0){
                        delete users[room];
                    }
                }
            }
        }
        //var us = JSON.stringify(users);
        //io.sockets.emit('user_update', us);   
    }); 
    
    //universal message handlers
    client.on('socket_message_all', function (data) {
        io.sockets.emit('socket_message', data);        
    });
   
    //universal message handlers
    client.on('socket_message_broadcast', function (data) {
        client.broadcast.emit('socket_message', data);        
    });
    
    client.on('socket_message_broadcast_to', function (data) {
        io.sockets.socket(data.to).emit("socket_message", data);
    });
    
    
    //
    // chatroom events
    //
    client.on('chatroom_joined', function (data) {
        data.id = client.id;
        client.peer = data.peer;
        if(chatroom[data.room] == undefined){
            chatroom[data.room] = [];
        }
        chatroom[data.room].push(data);
        
        //join specific room
        client.room = data.room;
        client.join(data.room);

        var cr = JSON.stringify(chatroom[data.room]);
        io.sockets.to(data.room).emit('chatroom_update', cr);
    });    
    
    client.on('chatRoom-team-message', function (data) {
        var message = data.message;
        message = message.replace(/</g, '&lt;');
        message = message.replace(/>/g, '&gt;');
        data.message = message;  
        var roomUsers = chatroom[client.room];
        for(var i = 0; i < roomUsers.length; i++){
            if(roomUsers[i].admin ){
                io.sockets.socket(roomUsers[i].id).emit('chatRoom-team-message-render', data);
            }
        }        
    });
    
    client.on('chatRoom-message', function (data) {
        var message = data.message;
        message = message.replace(/</g, '&lt;');
        message = message.replace(/>/g, '&gt;');
        data.message = message;
        if(typeof data.recipient != "undefined"){
            io.sockets.socket(data.recipient).emit('chatRoom-message-render', data);
            io.sockets.socket(data.client).emit('chatRoom-message-render', data);
            
        // send first message to all admins    
        } else {
            io.sockets.socket(data.client).emit('chatRoom-message-render', data);
            var roomUsers = chatroom[client.room];
            for(var i = 0; i < roomUsers.length; i++){
                if(roomUsers[i].admin && roomUsers[i].userUuid != data.senderUuid){
                    io.sockets.socket(roomUsers[i].id).emit('chatRoom-message-render', data);
                }
            }
        } 
        
//        else {
//            io.sockets.to(client.room).emit('chatRoom-message-render', data);
//        }
    });

    client.on('chatRoom-getUsers', function (data) {
        var cr = JSON.stringify(chatroom[client.room]);
        io.sockets.socket(client.id).emit('chatRoom-getUsers-resp', cr);
    });
    
    client.on('disconnect', function (data) {
        var usr;
        var flag = false;
        for(var room in chatroom){
            var roomUsers = chatroom[room];
            for(var user in roomUsers){
                if(roomUsers[user].id == client.id){
                    console.log("found in chatroom, deleting peer " + client.id);
                    console.log("");                    
                    flag = true;
                    usr = roomUsers[user];
                    roomUsers.splice(user, 1);
                    if(roomUsers.length == 0){
                        delete chatroom[room];
                    }
                }
            }
        }
        
        if(flag){
            io.sockets.to(client.room).emit('chatroom_disconnect', usr);        
            var cr = JSON.stringify(chatroom[client.room]);
            io.sockets.to(client.room).emit('chatroom_update', cr);        
        }
    });     

    client.on('chatroom_reconnect', function (data) {
        // disconnect
        var usr;
        for(var room in chatroom){
            var roomUsers = chatroom[room];
            for(var user in roomUsers){
                if(roomUsers[user].id == client.id){
                    usr = roomUsers[user];
                    roomUsers.splice(user, 1);
                    if(roomUsers.length == 0){
                        delete chatroom[room];
                    }
                }
            }
        }
        io.sockets.to(client.room).emit('chatroom_disconnect', usr);        
        var cr = JSON.stringify(chatroom[client.room]);
        io.sockets.to(client.room).emit('chatroom_update', cr);       
        
        // connect
        data.id = client.id;
        client.peer = data.peer;
        if(chatroom[data.room] == undefined){
            chatroom[data.room] = [];
        }
        chatroom[data.room].push(data);
        
        //join specific room
        client.room = data.room;
        client.join(data.room);

        var cr = JSON.stringify(chatroom[data.room]);
        setTimeout(function(){
            io.sockets.to(data.room).emit('chatroom_update', cr);
        }, 1000);           
    });     
   
    
    
    //
    // signalmaster events
    //
    
    // pass a message to another id
    client.on('message', function (details) {
        var otherClient = io.sockets.sockets[details.to];
        if (!otherClient) return;
        details.from = client.id;
        otherClient.emit('message', details);
    });

    client.on('shareScreen', function () {
        client.resources.screen = true;
    });

    client.on('unshareScreen', function (type) {
        client.resources.screen = false;
        if (client.room) removeFeed('screen');
    });
    client.on('join', join);

    function removeFeed(type) {
        io.sockets.in(client.room).emit('remove', {
            id: client.id,
            type: type
        });
    }

    function join(name, cb) {
        // sanity check
        if (typeof name !== 'string') return;
        // leave any existing rooms
        if (client.room) removeFeed();
        safeCb(cb)(null, describeRoom(name))
        client.join(name);
        client.room = name;
    }

    // we don't want to pass "leave" directly because the
    // event type string of "socket end" gets passed too.
    client.on('disconnect', function () {
        data = {};
        data.client = client.id;
        data.peer = client.peer;
        io.sockets.emit('user_disconnect', JSON.stringify(data));
        
        //var us = JSON.stringify(users);
        //io.sockets.emit('user_update', us);
        removeFeed();
    });
    client.on('leave', removeFeed);
    
    client.on('videoAdded', function (peer) {
        io.sockets.emit('videoAdded', "video added");
    });

    client.on('create', function (name, cb) {
        if (arguments.length == 2) {
            cb = (typeof cb == 'function') ? cb : function () {};s
            name = name || uuid();
        } else {
            cb = name;
            name = uuid();
        }
        // check if exists
        if (io.sockets.clients(name).length) {
            safeCb(cb)('taken');
        } else {
            join(name);
            safeCb(cb)(null, name);
        }
    });
    
}); 
// end of socket.io on connect 


if (config.uid) process.setuid(config.uid);
console.log('Server running at: https://localhost:' + config.server.port);