// Copyright 2017,2018 Axiomware Systems Inc. 
//
// Licensed under the MIT license <LICENSE-MIT or 
// http://opensource.org/licenses/MIT>. This file may not be copied, 
// modified, or distributed except according to those terms.
//

//Add external modules dependencies
var netrunr = require('netrunr-gapi-async');
var inquirer = require('inquirer');
var chalk = require('chalk');
var figlet = require('figlet');
var fs = require('fs');
var Preferences = require("preferences");
var CLI = require('clui');

//Gobal variables
const gapiAsync = new netrunr('');                      //Create at Netrunr gateway instance(one per gateway)
var prefs = new Preferences('myAdvApp_uniqueID123');    //Preferences are stored in system file
var advDeviceList = {};                                 //collect all devices that advertise over a period
var exitFlag = false;                                   //set flag when exiting
var dataFileHandle = null;                              //Open file for storing adv data , append to existing file
var dataFileWriteHeader = false;                        //Keep track of header writing, only write if new file
var gSensorSelection = [];                              //Keep track of selected sensors
var statusList = new CLI.Spinner('Scanning ...');       //UI widget to show busy operation

//Configuration
var userConfig = {
    'scanPeriod': 1,    // seconds of advertising scan
    'scanMode': 1,      // 1-> active, 0-> passive
    'interval_min': 16, // x1.25ms - Connection intervalk min
    'interval_max': 80, // x1.25ms - Connection interval max
    'latency': 0,       // Salve latency
    'timeout': 80,      // x10ms - Supervision timeout
    sensorChoices: [
        { name: 'HDC1000 Humidity/Temperature sensor', value: 1 },
        { name: 'BMP280 Pressure/Temperature sensor', value: 2 },
        { name: 'TMP007 IR Temperature sensor', value: 3 },
        { name: 'MPU9250 Motion sensor', value: 4 },
        { name: 'OPT3001 Optical sensor', value: 5 },
    ],
    gattHDCData: {
        cache: false,
        services: [
            {
                uuid: '00000000000000b00040510400aa00f0', //Service UUID for IR
                characteristics: [
                    {
                        uuid: '00000000000000b00040510401aa00f0', //'0023' - Data char (read/notify)
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510402aa00f0', //'0026' - Config - enable/disable sensor
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510403aa00f0', //'0028' - Data rate setting
                        handle: null,
                        properties: null
                    }
                ]
            },
            {
                uuid: '00000000000000b00040510420aa00f0', //Service UUID for temp-humidity
                characteristics: [
                    {
                        uuid: '00000000000000b00040510421aa00f0', //'002b' - Data char (read/notify)
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510422aa00f0', //'002e' - Config - enable/disable sensor
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510423aa00f0', //'0031' - Data rate setting
                        handle: null,
                        properties: null
                    }
                ]
            },
            {
                uuid: '00000000000000b00040510440aa00f0', //Service UUID for Barometric pressure
                characteristics: [
                    {
                        uuid: '00000000000000b00040510441aa00f0', //'0033' - Data char (read/notify)
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510442aa00f0', //'0036' - Config - enable/disable sensor
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510444aa00f0', //'0038' - Data rate setting
                        handle: null,
                        properties: null
                    }
                ]
            },
            {
                uuid: '00000000000000b00040510480aa00f0', //Service UUID for movement sensor
                characteristics: [
                    {
                        uuid: '00000000000000b00040510481aa00f0', //'003b' - Data char (read/notify)
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510482aa00f0', //'003e' - Config - enable/disable sensor
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510483aa00f0', //'0040' - Data rate setting
                        handle: null,
                        properties: null
                    }
                ]
            },
            {
                uuid: '00000000000000b00040510470aa00f0', //Service UUID for optical sensor
                characteristics: [
                    {
                        uuid: '00000000000000b00040510471aa00f0', //'003b' - Data char (read/notify)
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510472aa00f0', //'003e' - Config - enable/disable sensor
                        handle: null,
                        properties: null
                    },
                    {
                        uuid: '00000000000000b00040510473aa00f0', //'0040' - Data rate setting
                        handle: null,
                        properties: null
                    }
                ]
            }
        ]
    }
};

//Used to monitor for ctrl-c and exit program
process.stdin.resume();//so the program will not close instantly
process.on("SIGINT", function () {
    axShutdown(3, "Received Ctrl-C - shutting down.. please wait");
});

//On exit handler
process.on('exit', function () {
    console.log('Goodbye!');
});

// Ensure any unhandled promise rejections get logged.
process.on('unhandledRejection', err => {
    axShutdown(3, "Unhandled promise rejection - shutting down.. " + JSON.stringify(err, Object.getOwnPropertyNames(err)));
})

//Application start
console.log(chalk.green.bold(figlet.textSync('NETRUNR GATEWAY', { horizontalLayout: 'default' })));
console.log(chalk.green.bold('Data Acquisition from TI SensorTag (Async version)'));
console.log(chalk.red.bold('Press Ctrl-C to exit'));
main(); // Call main function

/**
 * Main program entry point
 * Using Command Line Interface (CLI), get user credentails
 * 
 */
async function main() {
    try {
        let cred = await axmUIgetAxiomwareCredentials();                        //get user credentials (CLI)
        let ret = await gapiAsync.login({ 'user': cred.user, 'pwd': cred.pwd });//login
        let gwid = await axmUIgetGatewaySelection(ret.gwid);                    //get gateway Selection (CLI)
        if (!gwid)
            await axShutdown(3, 'No Gateways Selected! Shutting down...');                            //Exit program 

        gapiAsync.config({ 'gwid': gwid });                                     //select gateway (CLI)
        await gapiAsync.open({});                                               //open connection to gateway
        gapiAsync.event({ 'did': '*' }, myGatewayEventHandler, null);           //Attach event handlers
        gapiAsync.report({ 'did': '*' }, myGatewayReportHandler, null);         //Attach report handlers

        let ver = await gapiAsync.version(5000);                              //Check gateway version - if gateway is not online(err), exit 
        
        let scanParams = await axmUIgetScanPeriodType();                        //get scan parameters
        userConfig.scanPeriod = scanParams.period;                        //store var in global for other function calls 
        userConfig.scanMode = scanParams.active;                          //store var in global for other function calls 
        
        gSensorSelection = await axmUIgetSensorSelection(userConfig.sensorChoices);                        //Get sensor selection
        if (!gSensorSelection)
            await axShutdown(3, 'No Sensors Selected. Shutting down...');                            //Exit program 
        
        let advLogFileName = await axmUIgetFilename();
        if (advLogFileName) {
            dataFileWriteHeader = fs.existsSync(advLogFileName) ? ((fs.statSync(advLogFileName).size > 10) ? false : true) : true;//Write file header if brand new file
            dataFileHandle = fs.createWriteStream(advLogFileName, { 'flags': 'a' });//Open file for storing adv data , append to existing file
            dataFileHandle.on('error', async (err) => { await axShutdown(3, 'File error: ' + JSON.stringify(err, Object.getOwnPropertyNames(err))); });
        }
        
        await axScanForBLEdev(userConfig.scanMode, userConfig.scanPeriod);//scan for BLE devices
    } catch (err) {
        await axShutdown(3, 'Error! Exiting... ' + JSON.stringify(err, Object.getOwnPropertyNames(err)));//Error - exit
    }
}

/**
 * Scan for BLE devices and generate "scan complete" event at the end of scan
 * 
 * @param {number} scanMode - Scan mode  1-> active, 0-> passive
 * @param {number} scanPeriod - Scan period in seconds
 */
async function axScanForBLEdev(scanMode, scanPeriod) {
    statusList.start();
    statusList.message('Scanning ...');
    advDeviceList = {};//Clear list
    try {
        let ret = await gapiAsync.list({ 'active': scanMode, 'period': scanPeriod });
    } catch (err) {
        console.log('List failed' + JSON.stringify(err, Object.getOwnPropertyNames(err)));
    }
};


/**
 * Connect to selected device and read list of services/characteristics
 * 
 * @param {string} did -  BLE device ID
 * @param {number} dType - Advertisement type
 * @param {string} name - Device name (or null)
 */
async function axConnectToBLEdevice(did, dType, name) {
    var iobjc = {
        'did': did,
        'dtype': dType,                                 /*1-> random, 0-> public*/
        'interval_min': userConfig.interval_min,  /* x1.25ms */
        'interval_max': userConfig.interval_max,  /* x1.25ms */
        'latency': userConfig.latency,
        'timeout': userConfig.timeout             /* x10ms */
    };

    var GATTlist = { 'did': did, 'dt': dType, 'name': name };//Data structure to collect GATT data
    var statusScan = new CLI.Spinner('Connecting ...'); //Show user spinning widget
    statusScan.start();

    try {

        let devBLE = await gapiAsync.connect(iobjc);//Connect to device

        statusScan.message('Connected! Scanning for services ...');
        await axCacheGATThandles(did, userConfig.gattHDCData);//get all the GATT handles

        if (gSensorSelection.find((item) => (item == 1))) {//Enable Humidity sensor
            statusScan.message('Connected! Enabling Humidity sensor ...');
            let dat1 = await gapiAsync.write({ 'did': did, 'ch': userConfig.gattHDCData.services[1].characteristics[1].handle, 'value': '01' });

            statusScan.message('Connected! Enabling Humidity notifications ...');
            let sub1 = await gapiAsync.subscribe({ 'did': did, 'ch': userConfig.gattHDCData.services[1].characteristics[0].handle, 'notify': 1 });
        }

        if (gSensorSelection.find((item) => (item == 2))) {//Enable pressure sensor
            statusScan.message('Connected! Enabling Pressure sensor ...');
            let dat2 = await gapiAsync.write({ 'did': did, 'ch': userConfig.gattHDCData.services[2].characteristics[1].handle, 'value': '01' });

            statusScan.message('Connected! Enabling Pressure notifications ...');
            let sub2 = await gapiAsync.subscribe({ 'did': did, 'ch': userConfig.gattHDCData.services[2].characteristics[0].handle, 'notify': 1 });
        }

        if (gSensorSelection.find((item) => (item == 3))) {//Enable IR sensor
            statusScan.message('Connected! Enabling IR Temperature sensor ...');
            let dat2 = await gapiAsync.write({ 'did': did, 'ch': userConfig.gattHDCData.services[0].characteristics[1].handle, 'value': '01' });

            statusScan.message('Connected! Enabling IR Temperature notifications ...');
            let sub2 = await gapiAsync.subscribe({ 'did': did, 'ch': userConfig.gattHDCData.services[0].characteristics[0].handle, 'notify': 1 });
        }

        if (gSensorSelection.find((item) => (item == 4))) {//Enable Motion sensor
            statusScan.message('Connected! Enabling Motion sensor ...');
            let dat2 = await gapiAsync.write({ 'did': did, 'ch': userConfig.gattHDCData.services[3].characteristics[1].handle, 'value': 'ff00' });

            statusScan.message('Connected! Enabling Motion notifications ...');
            let sub2 = await gapiAsync.subscribe({ 'did': did, 'ch': userConfig.gattHDCData.services[3].characteristics[0].handle, 'notify': 1 });
        }   

        if (gSensorSelection.find((item) => (item == 5))) {//Enable optical sensor
            statusScan.message('Connected! Enabling Optical sensor ...');
            let dat2 = await gapiAsync.write({ 'did': did, 'ch': userConfig.gattHDCData.services[4].characteristics[1].handle, 'value': '01' });

            statusScan.message('Connected! Enabling Optical notifications ...');
            let sub2 = await gapiAsync.subscribe({ 'did': did, 'ch': userConfig.gattHDCData.services[4].characteristics[0].handle, 'notify': 1 });
        }
        statusScan.stop();
    } catch (err) {
        statusScan.stop();
        await axShutdown(3, 'Error! Exiting... ' + JSON.stringify(err, Object.getOwnPropertyNames(err)));//Error - exit
    }
}

/**
 * Get handles using UUID values. This function will cache the handles for later use
 * 
 * @param {string} did - Bluetooth device address
 * @param {Object} GATTtable - Input object with UUID. This object will get updated!!!
 */
async function axCacheGATThandles(did, GATTtable) {
    if (!GATTtable.cache) { // check if results have already been collected?
        try {
            let srvList = await gapiAsync.services({ 'did': did, 'primary': 1 });//Get serice list       
            for (let i = 0; i < GATTtable.services.length; i++) {
                let srvHandle = axGetHandle(GATTtable.services[i].uuid, srvList.services);
                if (srvHandle) {
                    let charList = await gapiAsync.characteristics({ 'did': did, 'sh': srvHandle.sh, 'eh': srvHandle.eh });
                    for (let j = 0; j < GATTtable.services[i].characteristics.length; j++) {
                        let charHandle = axGetHandle(GATTtable.services[i].characteristics[j].uuid, charList.characteristics);
                        if (charHandle) {
                            GATTtable.services[i].characteristics[j].handle = charHandle.sh;//store handle
                            GATTtable.services[i].characteristics[j].properties = charHandle.properties;//store properties
                        }
                    }
                }
            }
            GATTtable.cache = true;
        } catch (err) {
            await axShutdown(3, 'Error2 ! Exiting... ' + JSON.stringify(err, Object.getOwnPropertyNames(err)));//Error - exit
        }
    }
}

/**
 * Event handler (for scan complete, disconnection, etc events)
 * 
 * @param {Object} iobj - Event handler object - see API docs
 */
async function myGatewayEventHandler(iobj) {
    switch (iobj.event) {
        case 1: //disconnect event
            console.log('[' + getCurrentDateTime() +']Device disconnect event' + JSON.stringify(iobj, null, 0));
            break;
        case 39://Scan complete event
            statusList.stop();
            if (!exitFlag) {//Do not process events when in exit mode
                let dev = await axmUIgetAdvBLEdevice();
                if (dev.type == 2)
                    await axShutdown(3, 'Shutting down.. please wait ');
                else if (dev.type == 1)
                    await axScanForBLEdev(userConfig.scanMode, userConfig.scanPeriod);
                else
                    await axConnectToBLEdevice(dev.did, dev.dtype, dev.name);
            }
            break;
        default:
            console.log('[' + getCurrentDateTime() +']Other unhandled event [' + iobj.event + ']');
    }
}

/**
 * Report handler (for advertisement data, notification and indication events)
 * 
 * @param {Object} iobj - Report handler object - see API docs 
 */
function myGatewayReportHandler(iobj) {
    switch (iobj.report) {
        case 1://adv report
            var advPrnArray = axParseAdv(iobj.nodes);
            axUpdateAdvNodeList(advPrnArray);
            statusList.message('Scanning ...  Found ' + Object.keys(advDeviceList).length + ' Device(s)');
            break;
        case 27://Notification report
            axNotificationHandler(iobj)
            //console.log('Notification received: ' + JSON.stringify(iobj, null, 0))
            break;
        default:
            console.log('[' + getCurrentDateTime() +'](Other report) ' + JSON.stringify(iobj, null, 0))
    }
}

/**
 * Format adv packets to print to file using fs
 *
 * @param {string | null} fileHandle - filehandle
 * @param {Object[]} advArray - Array of advertsisement objects from report callback
 * @param {boolean} writeHeaderFlag - write csv file header if true
 * @returns {boolean} flag set to false to prevent header write on next call
 */
function axPrintNotificationDataToFile(fileHandle, writeHeaderFlag, ts, did, hdl, subID, data) {
    var str = "";
    if (fileHandle) {
        if (writeHeaderFlag) {
            str = "ts,did,hdl,data\n";
            fileHandle.write(str);//write CSV header one time
        }
        str = `${ts},${did},${parseInt(hdl, 16)},${subID},${data}\n`;
        fileHandle.write(str);//write CSV header one time
        return false;//Use this value to update writeHeaderFlag in calling function
    }
}


/**
 * Notification handler - decode and process notification data
 * 
 * @param {aobject} nobj - Notification object
 */
function axNotificationHandler(nobj) {
    let did = nobj.node;
    nobj.notifications.forEach(function (item) {
        if (item.handle == userConfig.gattHDCData.services[1].characteristics[0].handle) { //Humidity data
            let time = dateTime(item.tss + 1e-6 * item.tsus);  //add seconds and microseconds
            let TH = HDC1000Sensor(item.value);//Extract temperature and humidity data
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 0, TH.temperature.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 1, TH.RelHumidity.toFixed(2));
            console.log('N: [' + time + '][' + addrDisplaySwapEndianness(did) + '][' + item.handle + '] T=' + TH.temperature.toFixed(2) + 'degC RH=' + TH.RelHumidity.toFixed(2) + '%');
        }
        else if (item.handle == userConfig.gattHDCData.services[2].characteristics[0].handle) { //Pressure
            let time = dateTime(item.tss + 1e-6 * item.tsus);  //add seconds and microseconds
            let TP = BMP280Sensor(item.value);//Extract temperature and humidity data
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 0, TP.temperature.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 1, TP.pressure.toFixed(2));
            console.log('N: [' + time + '][' + addrDisplaySwapEndianness(did) + '][' + item.handle + '] T=' + TP.temperature.toFixed(2) + 'degC P=' + TP.pressure.toFixed(2) + 'hPa');
        }
        else if (item.handle == userConfig.gattHDCData.services[0].characteristics[0].handle) { //IR temp
            let time = dateTime(item.tss + 1e-6 * item.tsus);  //add seconds and microseconds
            let IR = TMP007Sensor(item.value);//Extract IR temperature and humidity data
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 0, IR.objTemp.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 1, IR.ambTemp.toFixed(2));
            console.log('N: [' + time + '][' + addrDisplaySwapEndianness(did) + '][' + item.handle + '] To=' + IR.objTemp.toFixed(2) + 'degC Ta=' + IR.ambTemp.toFixed(2) + 'degC');
        }
        else if (item.handle == userConfig.gattHDCData.services[3].characteristics[0].handle) { //Motion
            let time = dateTime(item.tss + 1e-6 * item.tsus);  //add seconds and microseconds
            let m = MPU9250Sensor(item.value);//Extract motion data
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 0, m.gx.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 1, m.gy.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 2, m.gz.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 3, m.ax.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 4, m.ay.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 5, m.az.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 6, m.mx.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 7, m.my.toFixed(2));
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 8, m.mz.toFixed(2));
            console.log('N: [' + time + '][' + addrDisplaySwapEndianness(did) + '][' + item.handle + '] gx=' + m.gx.toFixed(3) + ' gy=' + m.gy.toFixed(3) + ' gz=' + m.gz.toFixed(3) + ' ax=' + m.ax.toFixed(3) + ' ay=' + m.ay.toFixed(3) + ' az=' + m.az.toFixed(3) + ' mx=' + m.mx.toFixed(0) + ' my=' + m.my.toFixed(0) + ' mz=' + m.mz.toFixed(0));
        }
        else if (item.handle == userConfig.gattHDCData.services[4].characteristics[0].handle) { //optical sensor
            let time = dateTime(item.tss + 1e-6 * item.tsus);  //add seconds and microseconds
            let dat = OPT3001Sensor(item.value);//Extract optical lux data
            dataFileWriteHeader = axPrintNotificationDataToFile(dataFileHandle, dataFileWriteHeader, item.tss + 1e-6 * item.tsus, did, item.handle, 0, dat.lux.toFixed(2));
            console.log('N: [' + time + '][' + addrDisplaySwapEndianness(did) + '][' + item.handle + '] Lux=' + dat.lux.toFixed(2));
        }
        else {
            console.log(JSON.stringify(nobj, null, 0))
        }
    });
};
 
/**
 * HDC1000 temperature and humidity sensor
 * Extract humidity data from hexstring. From TI specs at
 * http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide
 * 
 * @param {string} str - hexstring humidity data
 * 
 * @returns {object} - temperature and humidity
 */
function HDC1000Sensor(str) {
    const buf = Buffer.from(str, 'hex');
    const xa = buf.readUInt16LE(0);//Little-endian 16-bit to unsigned integer - Temperature
    const xb = buf.readUInt16LE(2);//Little-endian 16-bit to unsigned integer - Humidity
    const Temp = (xa / 65536) * 165 - 40;
    const RH = 100 * (xb & (~0x0003)) / 65536;
    return { 'temperature': Temp, 'RelHumidity': RH };
}

/**
 * BMP280 temperature and barometric pressure sensor
 * Extract pressure data from hexstring. From TI specs at
 * http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide
 * 
 * @param {string} str - hexstring pressure data
 * 
 * @returns {object} - temperature and pressure
 */
function BMP280Sensor(str) {
    const buf = Buffer.from(str, 'hex');
    const xa = buf.readUInt8(2) * 256 * 256 + buf.readUInt8(1) * 256 + buf.readUInt8(0);//Temperature
    const xb = buf.readUInt8(5) * 256 * 256 + buf.readUInt8(4) * 256 + buf.readUInt8(3);//Pressure
    const Temp = (xa / 100.0);
    const P = (xb / 100.0);
    return { 'temperature': Temp, 'pressure': P };
}

/**
 * TMP007 IR temperature sensor
 * Extract temperature data from hexstring. From TI specs at
 * http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide
 * 
 * @param {string} str - hexstring IR data
 * 
 * @returns {object} - object and ambient temperature
 */
function TMP007Sensor(str) {
    const buf = Buffer.from(str, 'hex');
    const xa = buf.readUInt16LE(0);//Little-endian 16-bit to unsigned integer - Object Temperature
    const xb = buf.readUInt16LE(2);//Little-endian 16-bit to unsigned integer - Ambient Temperature
    const tempObj = 0.03125 * (xa / 2.0);
    const tempAmb = 0.03125 * (xb / 2.0);
    return { 'objTemp': tempObj, 'ambTemp': tempAmb };
}

/**
 * MPU9250 Motion sensor
 * Extract motion data from hexstring. From TI specs at
 * http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide
 * 
 * @param {string} str - hexstring motion data
 * 
 * @returns {object} - gyro, accel and mag data
 */
function MPU9250Sensor(str) {
    const buf = Buffer.from(str, 'hex');
    const gx = buf.readInt16LE(0) / (65536 / 500);//Little-endian 16-bit to unsigned integer - Gyro X - range +/- 250
    const gy = buf.readInt16LE(2) / (65536 / 500);//Little-endian 16-bit to unsigned integer - Gyro Y - range +/- 250
    const gz = buf.readInt16LE(4) / (65536 / 500);//Little-endian 16-bit to unsigned integer - Gyro Z - range +/- 250
    const ax = buf.readInt16LE(6) / (16384.0 / 4);//Little-endian 16-bit to unsigned integer - Accel X - range +/-2
    const ay = buf.readInt16LE(8) / (16384.0 / 4);//Little-endian 16-bit to unsigned integer - Accel Y - range +/-2
    const az = buf.readInt16LE(10) / (16384.0 / 4);//Little-endian 16-bit to unsigned integer - Accel Z - range +/-2
    const mx = buf.readInt16LE(12);//Little-endian 16-bit to unsigned integer - Mag X - range +/- 4900
    const my = buf.readInt16LE(14);//Little-endian 16-bit to unsigned integer - Mag Y - range +/- 4900
    const mz = buf.readInt16LE(16);//Little-endian 16-bit to unsigned integer - Mag Z - range +/- 4900
    return { 'gx': gx, 'gy': gy, 'gz': gz, 'ax': ax, 'ay': ay, 'az': az, 'mx': mx, 'my': my, 'mz': mz };
}

/**
 * OPT3001 Optical sensor
 * Extract Lux data from hexstring. From TI specs at
 * http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide
 * 
 * @param {string} str - hexstring optical instensity data
 * 
 * @returns {object} - optical intensity data
 */
function OPT3001Sensor(str) {
    const buf = Buffer.from(str, 'hex');
    const xa = (buf.readUInt8(1) & 0x0f) * 256 + buf.readUInt8(0);//Matissa
    const xb = (buf.readUInt8(1) & 0xf0) >> 4;//exponent
    const e = (xb == 0) ? 1 : 2 << (xb - 1);
    const lux = xa * 0.01 * e;
    return { 'lux': lux};
}

/**
 * Call this function to gracefully shutdown all connections
 * 
 * @param {number} retryCount - Number of retry attempts 
 * @param {string} prnStr - String to print before exit  
 */
async function axShutdown(retryCount, prnStr) {
    console.log(prnStr);
    exitFlag = true;
    let statusExit = new CLI.Spinner('Exiting ...');
    statusExit.start();
    if (gapiAsync.isOpen) {//stop scanning
        if (gapiAsync.isGWlive) {//only if gw is alive
            try {
                let ret = await gapiAsync.list({ 'active': userConfig.scanMode, 'period': 0 });//stop scan
                let cdev = await gapiAsync.show({});
                if (cdev.nodes.length > 0) {
                    await gapiAsync.disconnect({ did: '*' });
                }
            } catch (err) {
                console.log("Error: " + JSON.stringify(err));
                if (retryCount > 0)
                    setTimeout(async () => { await axShutdown(retryCount--, retryCount + ' Shutdown...') }, 100);
            }
        }
        await gapiAsync.close({});
    }
    if (gapiAsync.isLogin) {
        await gapiAsync.logout({});//logout
    }
    statusExit.stop();
    if (dataFileHandle)
        dataFileHandle.end();//clsoe data file
    process.exit()
};

/**
 * Get user credentails from command line interface (CLI)
 * 
 * @returns {Object} username and password
 */
async function axmUIgetAxiomwareCredentials() {
    var questions = [
        {
            name: 'user',
            type: 'input',
            message: 'Enter your Axiomware account username(e-mail):',
            default: () => { return prefs.user ? prefs.user : null; },//Use previously stored username
            validate: (email) => { return validateEmail(email) ? true : 'Please enter valid e-mail address'; }
        },
        {
            name: 'pwd',
            type: 'password',
            mask: '*',
            message: 'Enter your password:',
            default: () => { return prefs.pwd ? prefs.pwd : null; },//Use previously stored password(see comment below)
            validate: (value) => { return (value.length > 0) ? true : 'Please enter your password'; }
        }
    ];

    let answer = await inquirer.prompt(questions);
    prefs.user = answer.user;
    //prefs.pwd = answer.pwd; //Don't store password for security reasons. Enable this during development for convenience
    return { user: answer.user, pwd: answer.pwd };
}

/**
 * Get user choice of gateway selection (CLI)
 * 
 * @param {string []} gwidList - List of gateways
 * @returns {string} selected gateway
 */
async function axmUIgetGatewaySelection(gwidList) {
    var choice_ext = gwidList;//gwidList;
    choice_ext.push('Exit');
    var questions = [
        {
            type: 'list',
            name: 'gwid',
            message: 'Login success! Select the Netrunr gateway for connection:',
            choices: choice_ext,
        }
    ];
    let answers = await inquirer.prompt(questions);
    if (answers.gwid == 'Exit')
        return null;
    else
        return answers.gwid;
}

/**
 * get user choice of scan type period (CLI)
 * 
 * @returns {Object} type and scan period in seconds 
 */
async function axmUIgetScanPeriodType() {
    var questions = [
        {
            name: 'type',
            type: 'list',
            message: 'Connection open success! Enter scan type:',
            choices: [{ name: 'Active', value: 1 }, { name: 'Passive', value: 0 }]
        },
        {
            name: 'period',
            type: 'input',
            message: 'Enter scan period (seconds):',
            default: 5,
            validate: (value) => { return ((parseInt(value) != NaN) && (parseInt(value) >= 0)) ? true : 'Please enter scan period in seconds'; },
        }
    ];

    let answers = await inquirer.prompt(questions);
    return { 'active': answers.type, 'period': parseInt(answers.period) }
}

/**
 * Get user choice of multi-gateway selection (CLI)
 *
 * @param {string []} choiceList  - List of sensors
 * @returns {string} selected list of sensors
 */
async function axmUIgetSensorSelection(choiceList) {
    var question = [
        {
            type: 'checkbox',
            name: 'sensors',
            message: 'Select one or more sensors (none to exit):',
            choices: choiceList
        }
    ];
    let answer = await inquirer.prompt(question);
    if (answer.sensors.length == 0)
        return null;
    else
        return answer.sensors;
}

/**
 * get user choice of BLE device to connect and read GATT table (CLI)
 * 
 * @returns {Object} Device address, Address type and Name (null if not present)
 */
async function axmUIgetAdvBLEdevice() {
    var N = Object.keys(advDeviceList).length;
    var choiceList = [];
    var i = 0;

    for (var key in advDeviceList) {
        if (advDeviceList.hasOwnProperty(key)) {
            choiceList[i] = {
                name: (i + 1).toString() + ') [' + addrDisplaySwapEndianness(advDeviceList[key].did) + '] ' + advDeviceList[key].rssi + 'dBm ' + advDeviceList[key].name,
                value: { type: 0, did: advDeviceList[key].did, dtype: advDeviceList[key].dt, name: advDeviceList[key].name }
            }
            i++;
        }
    }
    choiceList.push(new inquirer.Separator());
    choiceList.push({ name: 'Scan again', value: { type: 1 } });
    choiceList.push({ name: 'Exit', value: { type: 2 } });

    var question = [
        {
            name: 'device',
            type: 'list',
            message: 'Found ' + Object.keys(advDeviceList).length + ' Device(s). Select Device to connect',
            choices: choiceList,
            paginated: true,
            pageSize: 30
        },
    ];

    let answer = await inquirer.prompt(question);
    if (answer.device.type == 2)
        return { type: 2 };//exit
    else if (answer.device.type == 1)
        return { type: 1 };//rescan
    else
        return { type: 0, did: answer.device.did, dtype: answer.device.dtype, name: answer.device.name };//connect to device
}

/**
 * get user choice of file name (CLI)
 * 
 * @returns {string | null} filename 
 */
async function axmUIgetFilename() {
    var questions = [
        {
            name: 'logFileState',
            type: 'list',
            message: 'Save advertisement data to file?',
            choices: [{ name: 'Yes', value: true }, { name: 'No', value: false }],
        },
        {
            name: 'logFileName',
            type: 'input',
            message: 'Enter file name for storing data:',
            default: () => { return prefs.dataFileName ? prefs.dataFileName : null },
            when: (answers) => { return answers.logFileState; },//Execute this question only if previous answer is true
        }
    ];

    let answers = await inquirer.prompt(questions);
    if (answers.logFileState)
        prefs.dataFileName = answers.logFileName;
    return answers.logFileState ? answers.logFileName : null;
}

// Utitlity Functions

//Get handle from UUID
/**
 * 
 * 
 * @param {string} targetUUID - UUID of service or characteristic we are looking for
 * @param {object []} scdList - List of UUID objects
 * @returns {object | null} returns start handle,  end handle and properties (for char)
 * or null if not found  
 */
function axGetHandle(targetUUID, scdList) {
    for (var i = 0; i < scdList.length; i++) {
        if (scdList[i].uuid == targetUUID) {
            let prop = scdList[i].hasOwnProperty('properties') ? scdList[i].properties : null;
            return { sh: scdList[i].handle, eh: scdList[i].end, properties: prop }
        }
    }
    return null
}

/**
 * Format adv packets to print using console.log
 * 
 * @param {Object[]} advArray - Array of advertsisement objects from report callback
 */
function axPrintAdvArray(advArray) {
    advArray.forEach((item) => { console.log(JSON.stringify(item, null, 0)) });
}

/**
 * Parse advertisement packets
 * 
 * @param {Object[]} advArray - Array of advertsisement objects from report callback
 * @returns 
 */
function axParseAdv(advArray) {
    var advArrayMap = advArray.map(axAdvExtractData);//Extract data
    var advArrayFilter = advArrayMap.filter(axAdvMatchSensorTag);//Filter adv
    return advArrayFilter;
}

/**
 * Function to extract advertisement data
 * 
 * @param {Object} advItem - Single advertisement object
 * @returns {Object} advObj - Single parsed advertisement data object
 */
function axAdvExtractData(advItem) {
    advObj = {
        ts: dateTime(advItem.tss + 1e-6 * advItem.tsus),    //Time stamp
        //did: addrDisplaySwapEndianness(advItem.did),      //BLE address
        did: advItem.did,                                   //BLE address - only raw address can be used by API
        dt: advItem.dtype,                                  // Adress type
        ev: advItem.ev,                                     //adv packet type
        rssi: advItem.rssi,                                 //adv packet RSSI in dBm
        adv: advItem.adv.length,                            //payload length of adv packet
        rsp: advItem.rsp.length,                            //payload length of rsp packet
        name: axParseAdvGetName(advItem.adv, advItem.rsp),  //BLE device name
        //adv1: JSON.stringify(advItem.adv, null, 0),       //payload of adv packet
        //rsp1: JSON.stringify(advItem.rsp, null, 0),       //payload of rsp packet
    };
    return advObj;
}

/**
 * Function to match all devices(dummy)
 * 
 * @param {any} advItem 
 * @returns {boolean} - true if advertsiment has to be retained
 */
function axAdvMatchAll(advItem) {
    return (true);
}


/**
 * Function to match TI sensorTag, see http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide
 * 
 * @param {any} advItem 
 * @returns {boolean} - true if advertsiment has to be retained
 */
function axAdvMatchSensorTag(advItem) {
    return (advItem.name == "CC2650 SensorTag");
}


/**
 * Get device name from advertisement packet
 * 
 * @param {Object} adv - Advertisement payload
 * @param {Object} rsp - Scan response payload
 * @returns {string} - Name of the device or null if not present
 */
function axParseAdvGetName(adv, rsp) {
    var didName = '';
    for (var i = 0; i < adv.length; i++) {
        if ((adv[i].t == 8) || (adv[i].t == 9)) {
            didName = adv[i].v;
            return didName;
        }
    }
    for (var i = 0; i < rsp.length; i++) {
        if ((rsp[i].t == 8) || (rsp[i].t == 9)) {
            didName = rsp[i].v;
            return didName;
        }
    }
    return didName;
}

/**
 * Add ADV data to gloabl list
 * 
 * @param {Object[]} advArray - Array of advertsisement objects from report callback
 */
function axUpdateAdvNodeList(advArray) {
    for (var i = 0; i < advArray.length; i++) {
        advDeviceList[advArray[i].did] = advArray[i];
    }
}

/**
 * Convert unix seconds to time string - local time (yyyy-mm-ddThh:mm:ss.sss).
 * 
 * @param {Number} s - Number is Unix time format in seconds
 * @returns {string} - in local time format
 */
function dateTime(s) {
    var d = new Date(s*1000);
    var localISOTime = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, -1);
    return localISOTime;
}

/**
 * Get local time in time string - local time (yyyy-mm-ddThh:mm:ss.sss).
 * 
 * @returns {string} - in local time format
 */
function getCurrentDateTime() {
    var d = new Date();
    var localISOTime = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, -1);
    return localISOTime;
};

/**
 * Validate email
 * 
 * @param {string} email - string in valid email format
 * @returns boolean - true if valid email address based on RegEx match
 */
function validateEmail(email) {
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

/**
 * Swap endianness of a hex-string 
 * 
 * @param {string} hexStr - Hex string(make sure length is even)
 * @returns {string} 
 */
function swapEndianness(hexStr) {
    if (hexStr.length > 2)
        return hexStr.replace(/^(.(..)*)$/, "0$1").match(/../g).reverse().join("");
    else
        return hexStr
}

/**
 * Swap endianness of a hex-string. Format it to standard BLE address style
 * 
 * @param {string} hexStr - Hex string(make sure length is even) 
 * @returns {string}
 */
function addrDisplaySwapEndianness(hexStr) {
    if (hexStr.length > 2)
        return hexStr.replace(/^(.(..)*)$/, "0$1").match(/../g).reverse().join(":").toUpperCase();
    else
        return hexStr
}