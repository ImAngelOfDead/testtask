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

function encryptSalsa20(message) {
  try {
    const cipher = crypto.createCipheriv('chacha20', SALSA20_KEY, SALSA20_IV);
    let encrypted = cipher.update(message, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted;
  } catch (error) {
    console.error('Ошибка шифрования:', error);
    throw new Error('Ошибка шифрования сообщения');
  }
}

function decryptSalsa20(encrypted) {
  try {
    const decipher = crypto.createDecipheriv('chacha20', SALSA20_KEY, SALSA20_IV);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Ошибка дешифрования:', error);
    throw new Error('Ошибка дешифрования сообщения');
  }
}

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
    // Клиент ответил на пинг, соединение активно
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

// Создаем API маршруты с передачей объекта сервера
const apiRoutes = require('./src/api/api')({
  eventBus,
  startWSServer,
  sendCommand,
  getClients,
  getClientInfo,
  checkServerStatus,
  isServerRunning: () => isServerRunning
});

// Подключаем API маршруты
app.use('/api', apiRoutes);

// Запуск сервера
server.listen(PORT, () => {
  console.log(`HTTPS Server запущен на порту ${PORT} (${ENV})`);
  
  // Активируем проверку неактивных клиентов
  setInterval(() => {
    const now = Date.now();
    clients.forEach((client, clientId) => {
      // Проверяем клиентов, которые не отвечали более 5 минут
      if (now - client.lastActivity > 5 * 60 * 1000) {
        eventBus.emit('log', `Клиент ${clientId} не отвечает, отключение...`);
        client.ws.terminate();
        clients.delete(clientId);
        eventBus.emit('clientDisconnected', { clientId });
      }
    });
  }, 60000);
});