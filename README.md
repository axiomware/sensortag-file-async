# sensortag-file-async
Collect data from [TI Sensortag](http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide) and store to file using [Axiomware's](http://www.axiomware.com) [netrunr-gapi-async](http://www.axiomware.com/apidocs/index.html) Javascript SDK

Program to illustrate Netrunr API functions. The program will perform the following functions: 1) connect to your account, 2) list all gateways associated with this account and use UI to select one or more of the gateways, 3) connect to the selected gateway(s), 4) scan for advertisements and filter to show only TI Sensortag devices, 5) Connect to one or more Sensortag devices, 6) collect multi-sensor data and 7) save to file if needed.

**This example uses promises and async/await functionality present in Nodejs version 8.+**.

## SDK, Documentation and examples
- [Netrunr B24C API Documentation](http://www.axiomware.com/apidocs/index.html)
- [Netrunr-gapi SDK](https://github.com/axiomware/netrunr-gapi-js)
  - [List of Netrunr-gapi examples](https://github.com/axiomware/list-of-examples-netrunr-gapi)
- [Netrunr-gapi-async SDK](https://github.com/axiomware/netrunr-gapi-async-js)
  - [List of Netrunr-gapi-async examples](https://github.com/axiomware/list-of-examples-netrunr-gapi-async)

## Requirements

- [Netrunr B24C](http://www.axiomware.com/netrunr-b24c-product.html) gateway
- Axiomware cloud account. See the Netrunr [quick start guide](http://www.axiomware.com/page-netrunr-b24c-qs-guide.html) on creating an account.
- Nodejs (see [https://nodejs.org/en/](https://nodejs.org/en/) for download and installation instructions)
  - Nodejs version 8.x.x is required due to the use of promises/async/await
- NPM (Node package manager - part of Nodejs)   
- Windows, MacOS or Linux computer with access to internet
- One of more TI SensorTag (CC2650) BLE peripheral devices.

## Installation

Clone the repo

`git clone https://github.com/axiomware/sensortag-file-async.git`

or download as zip file to a local directory and unzip.

Install all module dependencies by running the following command inside the directory

  `npm install`

## Optional customization before running the program
- If you are not able to locate your device, you can try to scan using the `active` mode. The Bluetooth®️LE name of some devices is located in `advertisement_scan_response`. An `advertisement_scan_response` is obtained only during an `active scan`.
- If you have difficulties in connecting to your device, you may need to change connection parameters. The defaults in `userConfig` will work for most devices..
```javascript
//User configuration
var userConfig = {           
    'scanPeriod': 1,    // seconds of advertising scan
    'scanMode': 1,      // 1-> active, 0-> passive
    'interval_min': 16, // x1.25ms - Connection intervalk min
    'interval_max': 80,// x1.25ms - Connection interval max
    'latency': 0,       // Salve latency
    'timeout': 80,     // x10ms - Supoervios timout
    //Other data skipped here
    //
};
```

## Usage

Run the nodejs application:

    node appSensorTagFileAsync.js

To force exit, use:

    CTRL-C  

## Error conditions/Troubleshooting

- If the program is not able to login, check your credentials.
- If the gateway is not listed in your account, it may not have been successfully provisioned. See the Netrunr [quick start guide](http://www.axiomware.com/page-netrunr-b24c-qs-guide.html) for provisioning the gateway.
- Not able to get version information of the gateway. Check if gateway is powered ON and has access to internet. Also, check if firewall is blocking internet access.
- If you're not able to locate your device, check if your BLE device is advertising. The TI Sensortag will stop advertising after 3 minutes. Verify that the TI Sensortag is not connected to some other device. If the sensortag is advertising, the green LED will be blinking.

## Contributing

In lieu of a formal style guide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code.    
