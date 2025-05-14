const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const os = require('os');

const ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 443;

const SALSA20_KEY = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 
  0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f
]);

const SALSA20_IV = Buffer.from([
  0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);


let salsa20;
try {
  salsa20 = require('salsa20-js');
} catch (e) {
  console.warn("Библиотека salsa20-js не найдена. Используется встроенная реализация chacha20 как аналог.");
  salsa20 = null;
}

function encryptSalsa20(message) {
  try {
    if (salsa20) {
      const cipher = new salsa20(SALSA20_KEY, SALSA20_IV);
      const messageBuffer = Buffer.from(message, 'utf8');
      const encrypted = cipher.encrypt(messageBuffer);
      return Buffer.from(encrypted);
    } else {
      const cipher = crypto.createCipheriv('chacha20', SALSA20_KEY, SALSA20_IV);
      let encrypted = cipher.update(message, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      return encrypted;
    }
  } catch (error) {
    console.error('Ошибка шифрования:', error);
    throw new Error('Ошибка шифрования сообщения');
  }
}

function decryptSalsa20(encrypted) {
  try {
    if (salsa20) {
      const decipher = new salsa20(SALSA20_KEY, SALSA20_IV);
      const decrypted = decipher.decrypt(encrypted);
      return Buffer.from(decrypted).toString('utf8');
    } else {
      const decipher = crypto.createDecipheriv('chacha20', SALSA20_KEY, SALSA20_IV);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    }
  } catch (error) {
    console.error('Ошибка дешифрования:', error);
    throw new Error('Ошибка дешифрования сообщения');
  }
}

function createPureSalsa20() {
  const TAU = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
  const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
  
  function rol32(a, b) {
    return ((a << b) | (a >>> (32 - b))) >>> 0;
  }
  
  function littleEndian(buffer, index) {
    return buffer[index] | (buffer[index + 1] << 8) | (buffer[index + 2] << 16) | (buffer[index + 3] << 24);
  }
  
  function toLittleEndian(a, buffer, index) {
    buffer[index] = a & 0xff;
    buffer[index + 1] = (a >>> 8) & 0xff;
    buffer[index + 2] = (a >>> 16) & 0xff;
    buffer[index + 3] = (a >>> 24) & 0xff;
  }
  
  function salsa20Core(input, output) {
    let x0 = input[0],
        x1 = input[1],
        x2 = input[2],
        x3 = input[3],
        x4 = input[4],
        x5 = input[5],
        x6 = input[6],
        x7 = input[7],
        x8 = input[8],
        x9 = input[9],
        x10 = input[10],
        x11 = input[11],
        x12 = input[12],
        x13 = input[13],
        x14 = input[14],
        x15 = input[15];
    

    for (let i = 0; i < 10; i++) {

      x4 ^= rol32(x0 + x12, 7);
      x8 ^= rol32(x4 + x0, 9);
      x12 ^= rol32(x8 + x4, 13);
      x0 ^= rol32(x12 + x8, 18);
      
      x9 ^= rol32(x5 + x1, 7);
      x13 ^= rol32(x9 + x5, 9);
      x1 ^= rol32(x13 + x9, 13);
      x5 ^= rol32(x1 + x13, 18);
      
      x14 ^= rol32(x10 + x6, 7);
      x2 ^= rol32(x14 + x10, 9);
      x6 ^= rol32(x2 + x14, 13);
      x10 ^= rol32(x6 + x2, 18);
      
      x3 ^= rol32(x15 + x11, 7);
      x7 ^= rol32(x3 + x15, 9);
      x11 ^= rol32(x7 + x3, 13);
      x15 ^= rol32(x11 + x7, 18);
      
      x1 ^= rol32(x0 + x3, 7);
      x2 ^= rol32(x1 + x0, 9);
      x3 ^= rol32(x2 + x1, 13);
      x0 ^= rol32(x3 + x2, 18);
      
      x6 ^= rol32(x5 + x4, 7);
      x7 ^= rol32(x6 + x5, 9);
      x4 ^= rol32(x7 + x6, 13);
      x5 ^= rol32(x4 + x7, 18);
      
      x11 ^= rol32(x10 + x9, 7);
      x8 ^= rol32(x11 + x10, 9);
      x9 ^= rol32(x8 + x11, 13);
      x10 ^= rol32(x9 + x8, 18);
      
      x12 ^= rol32(x15 + x14, 7);
      x13 ^= rol32(x12 + x15, 9);
      x14 ^= rol32(x13 + x12, 13);
      x15 ^= rol32(x14 + x13, 18);
    }
    
    output[0] = x0 + input[0];
    output[1] = x1 + input[1];
    output[2] = x2 + input[2];
    output[3] = x3 + input[3];
    output[4] = x4 + input[4];
    output[5] = x5 + input[5];
    output[6] = x6 + input[6];
    output[7] = x7 + input[7];
    output[8] = x8 + input[8];
    output[9] = x9 + input[9];
    output[10] = x10 + input[10];
    output[11] = x11 + input[11];
    output[12] = x12 + input[12];
    output[13] = x13 + input[13];
    output[14] = x14 + input[14];
    output[15] = x15 + input[15];
  }
  
  function setupState(key, nonce, counter) {
    const state = new Uint32Array(16);
    
    state[0] = SIGMA[0];
    state[1] = SIGMA[1];
    state[2] = SIGMA[2];
    state[3] = SIGMA[3];
    
    for (let i = 0; i < 8; i++) {
      state[4 + i] = littleEndian(key, i * 4);
    }
    
    state[8] = counter;
    state[9] = 0;
    
    for (let i = 0; i < 2; i++) {
      state[10 + i] = littleEndian(nonce, i * 4);
    }
    
    return state;
  }
  
  function encrypt(data, key, nonce, counter = 0) {
    const result = Buffer.allocUnsafe(data.length);
    const state = setupState(key, nonce, counter);
    const block = new Uint32Array(16);
    
    for (let i = 0; i < data.length; i += 64) {
      salsa20Core(state, block);
      state[8]++;

      const blockBytes = new Uint8Array(64);
      for (let j = 0; j < 16; j++) {
        toLittleEndian(block[j], blockBytes, j * 4);
      }
      
      for (let j = 0; j < 64 && i + j < data.length; j++) {
        result[i + j] = data[i + j] ^ blockBytes[j];
      }
    }
    
    return result;
  }
  
  function decrypt(data, key, nonce, counter = 0) {
    return encrypt(data, key, nonce, counter);
  }
  
  return { encrypt, decrypt };
}

if (!salsa20 && !crypto.getCiphers().includes('chacha20')) {
  console.warn("Используется чистая JavaScript реализация Salsa20.");
  const pureSalsa20 = createPureSalsa20();
  
  encryptSalsa20 = function(message) {
    try {
      const messageBuffer = Buffer.from(message, 'utf8');
      return pureSalsa20.encrypt(messageBuffer, SALSA20_KEY, SALSA20_IV);
    } catch (error) {
      console.error('Ошибка шифрования:', error);
      throw new Error('Ошибка шифрования сообщения');
    }
  };
  
  decryptSalsa20 = function(encrypted) {
    try {
      const decrypted = pureSalsa20.decrypt(encrypted, SALSA20_KEY, SALSA20_IV);
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Ошибка дешифрования:', error);
      throw new Error('Ошибка дешифрования сообщения');
    }
  };
}

let sslOptions;
try {
  sslOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
  };
} catch (error) {
  console.error('SSL сертификаты не найдены:', error.message);
  console.error('Сгенерируйте сертификаты с помощью OpenSSL или укажите корректный путь к ним');
  process.exit(1);
}

const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    hostname: os.hostname(),
    timestamp: new Date().toISOString()
  });
});

const server = https.createServer(sslOptions, app);

const clients = new Map();
let wsServer = null;
let isServerRunning = false;
let serverStartTime = 0;

const eventBus = {
  callbacks: {},
  
  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
    return () => this.off(event, callback);
  },
  
  off(event, callback) {
    if (!this.callbacks[event]) return;
    this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
  },
  
  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Ошибка в обработчике события ${event}:`, error);
        }
      });
    }
  },
  
  once(event, callback) {
    const onceCallback = (data) => {
      this.off(event, onceCallback);
      callback(data);
    };
    this.on(event, onceCallback);
  }
};

function startWSServer() {
  if (isServerRunning) return;
  
  wsServer = new WebSocket.Server({ server });
  isServerRunning = true;
  serverStartTime = Date.now();
  
  eventBus.emit('serverStarted');
  
  wsServer.on('connection', (ws, req) => {
    handleNewConnection(ws, req);
  });
  
  wsServer.on('error', (error) => {
    console.error('WebSocket server error:', error);
    eventBus.emit('log', `Ошибка сервера: ${error.message}`);
  });
}

function handleNewConnection(ws, req) {
  let clientId = null;
  let isAuthorized = false;
  let buffer = Buffer.alloc(0);
  let connectionTime = Date.now();
  
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress;
  
  eventBus.emit('log', `Новое подключение с ${clientIp}`);
  
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);
  
  ws.on('pong', () => {
  });
  
  ws.on('message', (message) => {
    buffer = Buffer.concat([buffer, message]);
    
    if (!isAuthorized) {
      if (buffer.length >= 4) {
        const header = buffer.readUInt32BE(0);
        
        if (header !== 2) {
          eventBus.emit('log', `Отклонено подключение с неверным заголовком: ${header}`);
          ws.close();
          return;
        }
        
        buffer = buffer.slice(4);
        
        const botId = buffer.toString('utf8');
        
        if (botId.match(/^team\d+-[A-Z0-9]{32}$/)) {
          clientId = botId;
          clients.set(clientId, {
            ws,
            connectionTime,
            ip: clientIp,
            lastActivity: Date.now(),
            stats: {
              commandsReceived: 0,
              commandsSent: 0
            }
          });
          isAuthorized = true;
          buffer = Buffer.alloc(0); 
          
          eventBus.emit('clientConnected', { clientId });
          eventBus.emit('log', `Клиент авторизован: ${clientId}`);
        } else if (buffer.length > 100) { 
          eventBus.emit('log', `Отклонено подключение с неверным форматом botId`);
          ws.close();
        }
      }
    } else {
      try {
        const decrypted = decryptSalsa20(buffer);
        buffer = Buffer.alloc(0);
        
        const client = clients.get(clientId);
        if (client) {
          client.lastActivity = Date.now();
          client.stats.commandsReceived++;
        }
        
        eventBus.emit('commandResponse', { clientId, response: decrypted });
        eventBus.emit('log', `Получен ответ от ${clientId}`);
      } catch (error) {
        eventBus.emit('log', `Ошибка расшифровки: ${error.message}`);
      }
    }
  });
  
  ws.on('close', () => {
    clearInterval(heartbeatInterval);
    
    if (clientId) {
      clients.delete(clientId);
      eventBus.emit('clientDisconnected', { clientId });
      eventBus.emit('log', `Клиент отключен: ${clientId}`);
    } else {
      eventBus.emit('log', `Неавторизованный клиент отключен`);
    }
  });
  
  ws.on('error', (error) => {
    eventBus.emit('log', `Ошибка подключения: ${error.message}`);
  });
}

function sendCommand(clientId, command) {
  const client = clients.get(clientId);
  
  if (!client || !client.ws || client.ws.readyState !== WebSocket.OPEN) {
    eventBus.emit('log', `Клиент ${clientId} не найден или соединение закрыто`);
    return false;
  }
  
  try {
    const encrypted = encryptSalsa20(command);
    client.ws.send(encrypted);
    client.lastActivity = Date.now();
    client.stats.commandsSent++;
    eventBus.emit('log', `Команда отправлена клиенту ${clientId}`);
    return true;
  } catch (error) {
    eventBus.emit('log', `Ошибка отправки команды: ${error.message}`);
    return false;
  }
}

function getClients() {
  return Array.from(clients.keys());
}

function getClientInfo(clientId) {
  const client = clients.get(clientId);
  if (!client) return null;
  
  return {
    id: clientId,
    connectionTime: client.connectionTime,
    ip: client.ip,
    lastActivity: client.lastActivity,
    stats: client.stats,
    uptime: Date.now() - client.connectionTime
  };
}

function checkServerStatus() {
  return {
    isRunning: isServerRunning,
    clientCount: clients.size,
    uptime: isServerRunning ? Date.now() - serverStartTime : 0,
    clients: getClients()
  };
}

const apiRoutes = require('./src/api/api')({
  eventBus,
  startWSServer,
  sendCommand,
  getClients,
  getClientInfo,
  checkServerStatus,
  isServerRunning: () => isServerRunning
});

app.use('/api', apiRoutes);


server.listen(PORT, () => {
  console.log(`HTTPS Server запущен на порту ${PORT} (${ENV})`);
  

  setInterval(() => {
    const now = Date.now();
    clients.forEach((client, clientId) => {
      if (now - client.lastActivity > 5 * 60 * 1000) {
        eventBus.emit('log', `Клиент ${clientId} не отвечает, отключение...`);
        client.ws.terminate();
        clients.delete(clientId);
        eventBus.emit('clientDisconnected', { clientId });
      }
    });
  }, 60000);
});