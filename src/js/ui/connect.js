// Copyright (c) 2020 Jarret Dyrbye
// Distributed under the MIT software license, see the accompanying
// file LICENSE or http://www.opensource.org/licenses/mit-license.php

const DomUtl = require('./domutl.js').DomUtl;

const MoneysocketBeacon = require('moneysocket').MoneysocketBeacon;
const WebsocketLocation = require('moneysocket').WebsocketLocation;

const StackProgress = require('./stack_progress.js').StackProgress;

//////////////////////////////////////////////////////////////////////////////

const PROTOCOL_PREFIX = "moneysocket:"

const DEFAULT_HOST = "relay.socket.money";
const DEFAULT_PORT = 443;
const DEFAULT_USE_TLS = true;

//const DEFAULT_HOST = "127.0.0.1";
//const DEFAULT_PORT = 11060;
//const DEFAULT_USE_TLS = false;

//////////////////////////////////////////////////////////////////////////////
const copy = require('clipboard-copy')
//////////////////////////////////////////////////////////////////////////////

const MODES = new Set(["ENTER_BEACON",
                       "GENERATED_BEACON",
                       "OPERATING",
                       "CONNECTED",
                      ]);

class ConnectUi {
    constructor(div, title, app) {
        this.title = title;
        this.parent_div = div;
        this.my_div = null;

        this.app = app;
        console.assert(typeof app.doConnect == 'function');
        console.assert(typeof app.doDisconnect == 'function');

        this.mode = null;
        this.return_mode = null;
        this.input_div = null;

        this.beacon = null;
        this.beacon_str = null;
        this.generateNewBeacon();

        this.message_div = null;
        this.mode_output_div = null;
        this.mode_switch_button_div = null;

        this.stack_progress = null;
    }

    draw(style) {
        this.my_div = document.createElement("div");
        DomUtl.drawTitle(this.my_div, this.title, "h5");
        this.my_div.setAttribute("class", style);

        this.mode_output_div = DomUtl.emptyDiv(this.my_div);
        this.mode_output_div.setAttribute("class", "beacon-mode-output");
        DomUtl.drawBr(this.my_div);
        this.mode_switch_button_div = DomUtl.emptyDiv(this.my_div);

        this.switchMode("ENTER_BEACON");

        this.parent_div.appendChild(this.my_div);
    }

    postStackEvent(layer_name, event) {
        console.log("layer " + layer_name + " event: " + event);
        switch (layer_name) {
        case "OUTGOING_WEBSOCKET":
            switch (event) {
            case "NEXUS_CREATED":
                this.switchMode("OPERATING");
                break;
            case "NEXUS_WAITING":
                break;
            case "NEXUS_ANNOUNCED":
                break;
            case "NEXUS_REVOKED":
                this.switchMode("ENTER_BEACON");
                break;
            case "NEXUS_DESTROYED":
                this.switchMode("ENTER_BEACON");
                break;
            }
            break;
        case "OUTGOING_RENDEZVOUS":
            switch (event) {
            case "NEXUS_CREATED":
                break;
            case "NEXUS_WAITING":
                break;
            case "NEXUS_ANNOUNCED":
                break;
            case "NEXUS_REVOKED":
                break;
            case "NEXUS_DESTROYED":
                break;
            }
            break;
        case "CONSUMER":
            switch (event) {
            case "NEXUS_CREATED":
                break;
            case "NEXUS_WAITING":
                break;
            case "NEXUS_ANNOUNCED":
                this.switchMode("CONNECTED");
                break;
            case "NEXUS_REVOKED":
                break;
            case "NEXUS_DESTROYED":
                break;
            }
            break;
        case "PROVIDER":
            switch (event) {
            case "NEXUS_CREATED":
                break;
            case "NEXUS_WAITING":
                break;
            case "NEXUS_ANNOUNCED":
                this.switchMode("CONNECTED");
                break;
            case "NEXUS_REVOKED":
                break;
            case "NEXUS_DESTROYED":
                break;
            }
            break;
        }

        if (this.stack_progress != null) {
            this.stack_progress.drawStackEvent(layer_name, event);
        }
    }

    switchMode(new_mode) {
        console.assert(MODES.has(new_mode));
        this.mode = new_mode;

        DomUtl.deleteChildren(this.mode_switch_button_div);
        DomUtl.deleteChildren(this.mode_output_div);

        if (new_mode == "ENTER_BEACON") {
            this.stack_progress = null;
            this.return_mode = "ENTER_BEACON";
            var t = DomUtl.drawText(this.mode_output_div, "Input Beacon");
            t.setAttribute("style", "padding:5px;");

            DomUtl.drawBr(this.mode_output_div);
            this.input_div = DomUtl.drawTextInput(this.mode_output_div, "");
            DomUtl.drawBr(this.mode_output_div);

            DomUtl.drawButton(this.mode_output_div, "Scan QR",
                (function() {this.scanQr()}).bind(this));
            DomUtl.drawButton(this.mode_output_div, "Connect",
                (function() {
                    this.attemptConnectFromEnterBeacon();
                }).bind(this));

            this.setMessagePlaceholderDiv();

            DomUtl.drawButton(this.mode_switch_button_div, "Generate Beacon",
                (function() {
                    this.generateNewBeacon();
                    this.switchMode("GENERATED_BEACON");
                }).bind(this));

        } else if (new_mode == "GENERATED_BEACON") {
            this.stack_progress = null;
            this.return_mode = "GENERATED_BEACON";
            var t = DomUtl.drawText(this.mode_output_div, "Generated Beacon");
            t.setAttribute("style", "padding:5px;");

            DomUtl.qrCode(this.mode_output_div, this.beacon_str,
                          PROTOCOL_PREFIX);
            this.setCopyBeaconButton();
            DomUtl.drawBr(this.mode_output_div);
            DomUtl.drawButton(this.mode_output_div, "Connect",
                (function() {
                    this.attemptConnectFromGeneratedBeacon();
                }).bind(this));
            this.setMessagePlaceholderDiv();
            DomUtl.drawButton(this.mode_switch_button_div, "Input Beacon",
                (function() {this.switchMode("ENTER_BEACON")}).bind(this));

        } else if (new_mode == "OPERATING") {
            var t = DomUtl.drawText(this.mode_output_div, "Connecting");
            t.setAttribute("style", "padding:5px;");

            this.stack_progress = new StackProgress(this.mode_output_div);

            this.setCopyBeaconButton();
            this.setMessagePlaceholderDiv();

            DomUtl.drawButton(this.mode_switch_button_div, "Disconnect",
                (function() {this.disconnect()}).bind(this));
        } else if (new_mode == "CONNECTED") {
            var t = DomUtl.drawText(this.mode_output_div, "Connected");
            t.setAttribute("style", "padding:5px;");

            DomUtl.drawButton(this.mode_switch_button_div, "Disconnect",
                (function() {this.disconnect()}).bind(this));
        }
    }


    ///////////////////////////////////////////////////////////////////////////

    setCopyBeaconButton() {
        DomUtl.drawButton(this.mode_output_div, "Copy Beacon",
            (function() {this.copyBeacon()}).bind(this));
    }

    setMessagePlaceholderDiv() {
        DomUtl.drawBr(this.mode_output_div);
        this.message_div = DomUtl.emptyDiv(this.mode_output_div);
    }

    setMessage(msg) {
        DomUtl.deleteChildren(this.message_div);
        var t = DomUtl.drawText(this.message_div, msg);
        t.setAttribute("style", "padding:10px;");
    }

    ///////////////////////////////////////////////////////////////////////////

    copyBeacon() {
        copy(this.beacon_str)
        console.log("copied: " + this.beacon_str);
        this.setMessage("Beacon copied to clipboard");
    }

    scanQr() {
        console.log("scan stub")
        this.setMessage("QR scanning not implemented yet");
    }

    generateNewBeacon() {
        var location = new WebsocketLocation(DEFAULT_HOST, DEFAULT_PORT,
                                             DEFAULT_USE_TLS);
        var beacon = new MoneysocketBeacon();
        beacon.addLocation(location);
        this.beacon = beacon;
        this.beacon_str = beacon.toBech32Str();
    }

    ///////////////////////////////////////////////////////////////////////////

    attemptConnectFromEnterBeacon() {
        console.log("input children: " + this.input_div.firstChild);
        var input = this.input_div.firstChild.value;
        if (input.startsWith(PROTOCOL_PREFIX)) {
            input = input.slice(PROTOCOL_PREFIX.length);
        }
        var beacon_str = input;
        if (input == "") {
            this.setMessage("Please enter beacon string");
            return
        }
        var [beacon, err] = MoneysocketBeacon.fromBech32Str(beacon_str);
        if (err != null) {
            this.setMessage("could not interpret beacon");
            console.log("could not interpret beacon: " + beacon + " : " + err);
            return
        }
        this.beacon_str = beacon_str;
        this.beacon = beacon;
        this.app.doConnect(this.beacon);
    }

    attemptConnectFromGeneratedBeacon() {
        this.app.doConnect(this.beacon);
    }

    disconnect() {
        this.app.doDisconnect();
    }

    ///////////////////////////////////////////////////////////////////////////


    getBeacon() {
        return this.beacon;
    }

    getWsUrl() {
        var location = this.beacon.locations[0];
        if (! (location instanceof WebsocketLocation)) {
            return ""
        }
        var url = location.toWsUrl();
        console.log("websocket url: " + url);
        return url;
    }
}

exports.ConnectUi = ConnectUi;
