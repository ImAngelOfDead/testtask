const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const path = require('path');

router.use(bodyParser.json());

const apiClients = [];

function sseMiddleware(req, res, next) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const intervalId = setInterval(() => {
    res.write(':\n\n');
  }, 30000);
  
  const clientId = Date.now().toString() + Math.random().toString(36).substring(2, 15);
  const newClient = {
    id: clientId,
    res,
    connectedAt: new Date()
  };
  apiClients.push(newClient);
  
  req.on('close', () => {
    clearInterval(intervalId);
    const index = apiClients.findIndex(client => client.id === clientId);
    if (index !== -1) {
      apiClients.splice(index, 1);
    }
  });
  
  next();
}

function sendEvent(eventName, data) {
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
  const event = `event: ${eventName}\ndata: ${dataStr}\n\n`;
  
  apiClients.forEach(client => {
    try {
      client.res.write(event);
    } catch (error) {
      console.error(`Ошибка отправки события ${eventName} клиенту ${client.id}:`, error);
    }
  });
}

module.exports = function(server) {
  const { 
    eventBus, 
    startWSServer, 
    sendCommand, 
    getClients, 
    getClientInfo, 
    checkServerStatus,
    isServerRunning 
  } = server;

  router.get('/events', sseMiddleware, (req, res) => {
    const serverStatus = checkServerStatus();
    if (serverStatus.isRunning) {
      res.write('event: server-started\ndata: {}\n\n');
    
      const connectedClients = getClients();
      connectedClients.forEach(clientId => {
        res.write(`event: client-connected\ndata: ${JSON.stringify({ clientId })}\n\n`);
      });
    }
  });

  router.post('/start-server', (req, res) => {
    try {
      if (isServerRunning()) {
        return res.json({ success: true, message: 'Сервер уже запущен' });
      }
      
      startWSServer();
      res.json({ success: true, message: 'Сервер успешно запущен' });
    } catch (error) {
      console.error('Ошибка запуска сервера:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/send-command', (req, res) => {
    try {
      const { clientId, command } = req.body;
      
      if (!clientId || !command) {
        return res.status(400).json({
          success: false,
          error: 'Не указан ID клиента или команда'
        });
      }
      
      const success = sendCommand(clientId, command);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: `Не удалось отправить команду клиенту ${clientId}`
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Ошибка отправки команды:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/status', (req, res) => {
    try {
      const status = checkServerStatus();
      res.json({ success: true, status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/client/:clientId', (req, res) => {
    try {
      const { clientId } = req.params;
      const clientInfo = getClientInfo(clientId);
      
      if (!clientInfo) {
        return res.status(404).json({
          success: false,
          error: `Клиент ${clientId} не найден`
        });
      }
      
      res.json({ success: true, client: clientInfo });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/clients', (req, res) => {
    try {
      const clients = getClients();
      res.json({ success: true, clients });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  eventBus.on('serverStarted', () => {
    sendEvent('server-started', {});
  });

  eventBus.on('log', (message) => {
    sendEvent('log', { message, timestamp: new Date().toISOString() });
  });

  eventBus.on('clientConnected', (data) => {
    sendEvent('client-connected', data);
  });

  eventBus.on('clientDisconnected', (data) => {
    sendEvent('client-disconnected', data);
  });

  eventBus.on('commandResponse', (data) => {
    sendEvent('command-response', data);
  });

  return router;
};