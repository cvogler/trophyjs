/*!
 * googleclient.js - A demonstration GTalk IM client for Trophy.js
 * Copyright © 2013 Christian Vogler
 * 
 *  BROWSER COMPATIBILITY:
 *   Tested: Chrome 25, Firefox 19, Safari 5, Safari 6, IE9, Opera 12
 *   Tested within limits: Android 4.1 browser, Safari 6 on iOS
 *   Targeted (but untested): IE8, IE10
 *  
 *  LICENSE:
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at: http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *   
 *  ACKNOWLEDGMENTS:
 *   The development of this code was in part supported by funding from the
 *   National Institute on Disability and Rehabilitation Research, U.S. Department
 *   of Education, grant number H133E090001 (RERC on Telecommunications Access).
 *   However, this work does not necessarily represent the policy of the Department
 *   of Education, and you should not assume endorsement by the Federal Government.
 */

var BOSH_SERVICE = '/rtt/service/punjab-bind';
var gapiClientId = "1005271722392.apps.googleusercontent.com";
var gapiScopes = "https://www.googleapis.com/auth/googletalk https://www.googleapis.com/auth/userinfo.email";
var ID_CATEGORY = "client";
var ID_CLIENT = "web";
var ID_NAME = "Trophy.js RTT Client v0.01";
var ID_NODE = "http://tap.gallaudet.edu/rtt";

// Gallaudet's DNS has missing SRV records for _xmpp-client.
Strophe.addDomainOverride("gallaudet.edu", "gmail.com");

Trophy.log.setLogLevel(Trophy.log.INFO);
Strophe.log = function(level, message) {
    if (level >= Strophe.LogLevel.ERROR) {
        Trophy.log.error(message);
    }
};

function numOwnProperties(obj) {
    var count = 0;
    for (var k in obj)
        if (obj.hasOwnProperty(k))
            count++;
    return count;
}

var RosterGroup = function() {
    this.items = {};
    this.length = 0;
};

RosterGroup.prototype = {
    add: function(item) {
        var jid = item.jid;
        this.items[jid] = item;
        return this;
    },
    
    remove: function(item) {
        var jid = item.jid;
        if (this.items.hasOwnProperty(jid))
            delete this.items[jid];
        return this;
    },
    
    hasItemByJID: function(jid) {
        return this.items.hasOwnProperty(jid);
    },
    
    getItemByJID: function(jid) {
        return this.items[jid];
    },
    
    getSorted: function() {
        var sortedItems = [];
        for (var k in this.items) {
            if (this.items.hasOwnProperty(k))
                sortedItems.push(this.items[k]);
        }
        sortedItems.sort(function(a, b) {
            a = Roster.getName(a).toLowerCase();
            b = Roster.getName(b).toLowerCase();
            if (a < b) return -1;
            else if (a == b) return 0;
            else return 1;
        });
        return sortedItems;
    },
};


var Roster = function() {
    this.changeListener = null;
    this.updateListener = null;
    this.rttListener = null;
    this.jidIndex = {};
    this.rttSupport = {};
    this._clear();
};

Roster.getName = function(item) {
    return item.name !== null? item.name : item.jid;
};

Roster.isOnline = function(item) {
    return numOwnProperties(item.resources) > 0;
};

Roster.RTTSupport = {
    YES: 0,
    NO: 1,
    UNKNOWN: 2
};

Roster.prototype = {
    set: function(items) {
        this._clear();
        for (var i = 0; i < items.length; i++)
            this.update(items[i], true);
        if (this.changeListener !== null)
            this.changeListener();
        return this;
    },
    
    update: function(item, noupdate) {
        this.jidIndex[item.jid] = item;
        var onlineCount = 0;
        var nowOnline = false;
        var wasOnline = this.online.hasItemByJID(item.jid);
        for (var k in item.resources) {
            if (item.resources.hasOwnProperty(k)) {
                onlineCount++;
            }
        }
        if (onlineCount > 0) {
            nowOnline = true;
            this.online.add(item);
            this.offline.remove(item);
        }
        else {
            nowOnline = false;
            this.offline.add(item);
            this.online.remove(item);
        }
        if (! noupdate && this.updateListener !== null)
            this.updateListener(item, wasOnline, nowOnline);
        return this;
    },
    
    setChangeListener: function(listener) {
        this.changeListener = listener;
    },
    
    setUpdateListener: function(listener) {
        this.updateListener = listener;
    },
    
    setRTTStatusListener: function(listener) {
        this.rttListener = listener;
    },
    
    getGroup: function(group) {
        if (group === 'online')
            return this.online;
        else if (group === 'offline')
            return this.offline;
        else
            return null;
    },
    
    getItemByJid: function(jid) {
        return this.jidIndex[jid];
    },
    
    updateRTTSupport: function(fullJid, rttStatus) {
        this.rttSupport[fullJid] = rttStatus;
        if (this.rttListener !== null)
            this.rttListener(Strophe.getBareJidFromJid(fullJid));
    },
    
    hasRTTSupport: function(jid) {
        var item = this.getItemByJid(jid);
        if (! item)
            return Roster.RTTSupport.UNKNOWN;
        else {
            var no = 0;
            var unknown = 0;
            for (var k in item.resources) {
                if (item.resources.hasOwnProperty(k)) {
                    var rttSupport = this.rttSupport[jid + "/" + k];
                    if (rttSupport === Roster.RTTSupport.YES)
                        return rttSupport;
                    else if (rttSupport === Roster.RTTSupport.NO)
                        no++;
                    else
                        unknown++;
                }
            }
            return no > 0 && unknown === 0? Roster.RTTSupport.NO : Roster.RTTSupport.UNKNOWN;
        }
    },
    
    _clear: function() {
        this.jidIndex = {};
        this.rttSupport = {};
        this.online = new RosterGroup();
        this.offline = new RosterGroup();
    },
};

var RosterController = function(model, view, chatView, connection) {
    this.model = model;
    this.view = view;
    this.chatView = chatView;
    this.connection = connection;
    var delegate = this.view.getContainer();
    delegate.on("click.rttclient", "li.r", this, this._onRosterClick);
    this.connection.roster.registerCallback(this._rosterCallback.bind(this));
    this.connection.caps.addChangeListener(this._capsCallback.bind(this));
};

RosterController.prototype = {
    destroy: function() {
        var delegate = this.view.getContainer();
        delegate.off(".rttclient");
        this.model = null;
        this.view = null;
        this.chatView = null;
        this.connection = null;
    },
    
    connectionActive: function(rosterActiveCallback, rosterFailureCallback) {
        this.connection.roster.get(this._onRosterGetSuccess.bind(this, rosterActiveCallback),
                                   this._onRosterGetError.bind(this, rosterFailureCallback));
    },
    
    _rosterCallback: function(rosterItems, changedItem) {
        if (! changedItem) // we set entire roster
            this.model.set(rosterItems);
        else
            this.model.update(changedItem, false);
    },
    
    _capsCallback: function(fromJID) {
        var features = this.connection.caps.getCapabilitiesByJid(fromJID).features;
        var hasRTT = features.hasOwnProperty(Strophe.NS.RTT);
        this.model.updateRTTSupport(fromJID, hasRTT? Roster.RTTSupport.YES : Roster.RTTSupport.NO);
    },
    
    _onRosterGetSuccess: function(rosterActiveCallback, rosterItems) {
        rosterActiveCallback(this);
    },

    _onRosterGetError: function(rosterFailureCallback) {
        Trohy.log.error('Failed to retrieve roster');
        rosterFailureCallback(this);
    },
    
    _onRosterClick: function(event) {
        var jid = event.data.view.getJidById($(this).attr("id"));
        event.data.chatView.add(jid);
        event.data.chatView.activate(jid);        
    }
};

var ChatboxController = function(delegateTabView, selector, connection) {
    this.tabView = delegateTabView;
    this.connection = connection;
    this.selector = selector;
    var delegate = this.tabView.getContainer();
    delegate.on("keypress.rttclient", selector, this, this.onKeypress);
    delegate.on("keyup.rttclient", selector, this, this.onKeyup);
    delegate.on("focus.rttclient", selector, this, this.onFocus);
    delegate.on("blur.rttclient", selector, this, this.onBlur);
    delegate.on("tabclose.rttclient", this, this.onClose);
};

ChatboxController.prototype = {
    destroy: function() {
        var delegate = this.tabView.getContainer();
        delegate.off(".rttclient");
        this.tabView = null;
        this.connection = null;
    },
    
    onKeypress: function(event) {
        if (event.which == $.ui.keyCode.ENTER && ! event.shiftKey) {
            // user pressed enter -> send message
            event.preventDefault();
            var chatbox = $(this);
            event.data.onSend(chatbox);
        }
    },

    onKeyup: function(event) {
        // at this time, the textarea value may not yet have been updated,
        // so we need to let the key event complete before
        // checking further
        var chatbox = $(this);
        setTimeout(function() {
            var text = chatbox.data("text");
            if (text !== chatbox.val())
                event.data.onEdit(chatbox);
        }, 0);
    },

    onTimer: function(chatbox) {
        var text = chatbox.data("text");
        if (text !== chatbox.val())
            this.onEdit(chatbox);
    },

    onFocus: function(event) {
        var chatbox = $(this);
        var timer = chatbox.data("timer");
        if (! timer)
            timer = setInterval(event.data.onTimer.bind(event.data, chatbox), 1500);
        chatbox.data("text", chatbox.val());
        chatbox.data("timer", timer);
    },

    onBlur: function(event) {
        var chatbox = $(this);
        var timer = chatbox.data("timer");
        var text = chatbox.data("text");
        if (timer)
            clearInterval(timer);
        chatbox.data("timer", null);
        if (chatbox.val() !== text)
            event.data.onEdit(chatbox);
    },
    
    onClose: function(event, tabContent) {
        var allChatboxes = $(tabContent).parent().find(event.data.selector);
        var thisChatbox = $(tabContent).find(allChatboxes);
        thisChatbox.trigger("blur");
    },

    onSend: function(chatbox) {
        var div = chatbox.closest("div.mc");
        var chat = this.tabView.findById(div.attr("id"));
        var text = chat.commitOwnMessage();
        if (text.length > 0)
            this.connection.rtt.sendBody(chat.getJid(), text);
        chatbox.data("text", chatbox.val());
    },

    onEdit: function(chatbox) {
        var text = chatbox.val();
        var div = chatbox.closest("div.mc");
        var chat = this.tabView.findById(div.attr("id"));
        this.connection.rtt.rttUpdate(chat.getJid(), text);
        chatbox.data("text", text);
    }    
};


var SessionController = function(rosterModel, rosterView,
                                chatView, chatboxSelector,
                                connSuccessCallback, connFailureCallback,
                                disconnectCallback) {
    this.rosterModel = rosterModel;
    this.rosterView = rosterView;
    this.chatView = chatView;
    this.chatboxSelector = chatboxSelector;
    this.connSuccessCallback = connSuccessCallback;
    this.connFailureCallback = connFailureCallback;
    this.disconnectCallback = disconnectCallback;
    this.rosterController = null;
    this.chatboxController = null;
    this.connection = null;
    this.isConnected = false;
    this.reconnect = false;
    this.service = null;
};

SessionController.prototype = {
    handleAuthResult: function(result) {
        if (result && !result.error) {
            // We have authenticated successfully
            // Need to retrieve email address for follow-up with
            // Strophe.js login
            var that = this;
            var emailRequest = gapi.client.request({ path: 'oauth2/v2/userinfo' });
            emailRequest.execute(function (emailResponse) {
                var jid = emailResponse.email;
                var token = gapi.auth.getToken();
                that.connect(BOSH_SERVICE, jid, token.access_token);
            });
        }
        else {
            alert("Error while authenticating");
            // TBD: some kind of error message
        }
    },
        
    connect: function(service, jid, oauthToken) {
        this.service = service;
        this.jid = jid;
        this.oauthToken = oauthToken;
        if (this.isConnected) {
            // we need to wait for the disconnect to complete
            // - it is an asynchronous step. 
            this.reconnect = true;
            this.disconnect();
        }
        else {
            this.reconnect = false;
            this.connection = new Strophe.Connection(service);
            this.connection.rawInput = function (data) { Trophy.log.timedLog(Trophy.log.info, 'RECV: ' + data); };
            this.connection.rawOutput = function (data) { Trophy.log.timedLog(Trophy.log.info, 'SEND: ' + data); };
            this.connection.disco.addIdentity(ID_CATEGORY, ID_CLIENT, ID_NAME);
            this.connection.caps.node = ID_NODE;
            
            this.connection.rtt.setDefaultReceiveEventHandler(this._onReceiveAction.bind(this));
            this.rosterController = new RosterController(this.rosterModel, this.rosterView,
                    this.chatView, this.connection);
            this.chatboxController = new ChatboxController(this.chatView, this.chatboxSelector,
                    this.connection);
            this.connection.connect(this.jid, null, this._onConnect.bind(this), 60, 1, oauthToken);
        }
        
    },
    
    disconnect: function() {
        if (this.isConnected)
            this.connection.disconnect();
    },

    _finalizeDisconnect: function() {
        this.isConnected = false;
        this.connection = null;
        if (this.rosterController !== null) {
            this.rosterController.destroy();
            this.rosterController = null;
        }
        if (this.chatboxController !== null) {
            this.chatboxController.destroy();
            this.chatboxController = null;
        }
    },
    
    _onConnect: function(status) {
        if (status == Strophe.Status.CONNECTING) {
            Trophy.log.info('Strophe is connecting.');
        }
        else if (status == Strophe.Status.CONNFAIL) {
            Trophy.log.error('Strophe failed to connect.');
            this._finalizeDisconnect();
            this.connFailureCallback(this);
        }
        else if (status == Strophe.Status.AUTHFAIL) {
            Trophy.log.error('Strophe failed to authenticate.');
            this._finalizeDisconnect();
            this.connFailureCallback(this);
        }
        else if (status == Strophe.Status.DISCONNECTING) {
            Trophy.log.info('Strophe is disconnecting.');
        }
        else if (status == Strophe.Status.DISCONNECTED) {
            Trophy.log.info('Strophe is disconnected.');
            this._finalizeDisconnect();
            if (this.reconnect)
                this.connect(this.service, this.jid, this.oauthToken);
            else
                this.disconnectCallback(this);
        }
        else if (status == Strophe.Status.CONNECTED) {
            Trophy.log.info('Strophe is connected.');
            this.chatView.setMyJid(Strophe.getBareJidFromJid(this.connection.jid));
            var pres = $pres().c("c", this.connection.caps.generateCapsAttrs());
            this.connection.send(pres.tree());
            this.rosterController.connectionActive(this._onRosterSuccess.bind(this),
                    this._onRosterFailure.bind(this));
        }        
    },
    
    _onRosterSuccess: function() {
        this.isConnected = true;
        this.connSuccessCallback(this);
    },
    
    _onRosterFailure: function() {
        this.connection.disconnect();
        this.connFailureCallback(this);
    },
    
    _onReceiveAction: function(jid, event, text) {
        var chat = this.chatView.find(jid);
        if (event == Trophy.Event.BODY)
            chat.bodyMessage(text);
        else if (event == Trophy.Event.NEW_MESSAGE)
            chat.newRTTMessage(text);
        else if (event == Trophy.Event.RESET)
            chat.resetRTTMessage(text);
        else if (event == Trophy.Event.EDIT)
            chat.editRTTMessage(text);
    },
};


var RosterView = function(model, rosterNode) {
    this.model = null;
    this.toplevelNode = rosterNode;
    this.onlineNode = $(rosterNode).find("ul.roster-online");
    this.offlineNode = $(rosterNode).find("ul.roster-offline");
    this.wasUpdated = false;
    // Periodically check whether roster was updated
    // Updating rosters immediately when a large number of items
    // change is rather inefficient, and a 2-second delay won't be
    // noticeable.
    this.updateTimer = setInterval(this._checkUpdate.bind(this), 2000);
    this.setModel(model);
};

RosterView.prototype = {
    getContainer: function() {
        return this.toplevelNode;
    },
    
    getJidById: function(id) {
        return this.idMap[id];
    },
    
    setModel: function(model) {
        if (this.model !== null)
            this.model.setChangeListener(null);
        this.model = model;
        this._onChangeAll();
        this.model.setChangeListener(this._onChangeAll.bind(this));
        this.model.setUpdateListener(this._onChangeItem.bind(this));
        this.model.setRTTStatusListener(this._onChangeRTT.bind(this));
    },
    
    _checkUpdate: function() {
        if (this.wasUpdated)
            this._doChangeAll();
    },

    _doChangeAll: function() {
        this.nodeMap = {};
        this.idMap = {};
        this.nextId = 0;
        this.wasUpdated = false;
        this.onlineNode.children().remove();
        this.offlineNode.children().remove();
        this._populateGroup(this.onlineNode, this.model.getGroup("online"));
        this._populateGroup(this.offlineNode, this.model.getGroup("offline"));
    },
    
    _onChangeAll: function() {
        this._doChangeAll();
    },
    
    _onChangeItem: function(item, wasOnline, nowOnline) {
        this.wasUpdated = true;
    },
    
    _onChangeRTT: function(jid, rttStatus) {
        var item = this.model.getItemByJid(jid);
        if (item) {
            var rttStatus = this.model.hasRTTSupport(jid);
            if (Roster.isOnline(this.model.getItemByJid(jid))) {
                var liNode = this.nodeMap[jid];
                if (liNode) {
                    liNode.children('span.rtt').remove();
                    if (rttStatus === Roster.RTTSupport.YES)
                        liNode.prepend(this._makeRTTIcon());
                }
            }
        }
    },
    
    _populateGroup: function(list, group) {
        var items = group.getSorted();
        for (var i = 0; i < items.length; i++)
            this._newNode(list, items[i]);
    },
    
    _newNode: function(list, item) {
        var name = item.name;
        var jid = item.jid;
        var tooltip = name? 'Name:\u00a0' + name + '\u000a' :  '';
        tooltip += 'Id:\u00a0' + jid;
        var spanNode = $('<span>').attr("title", tooltip).text(Roster.getName(item));
        var liNode = $('<li class="r">').append(spanNode);
        if (Roster.isOnline(item) && this.model.hasRTTSupport(item.jid) == Roster.RTTSupport.YES) {
            liNode.prepend(this._makeRTTIcon());
        }
        var id = "ro" + this.nextId++;
        liNode.attr("id", id);
        list.append(liNode);
        this.nodeMap[item.jid] = liNode;
        this.idMap[id] = item.jid;
    },
    
    _makeRTTIcon: function() {
        return $('<span class="rtt" title="This user has real-time text enabled">(RTT) </span>');
    },
};


var ChatView = function(myJid, theirJid, theirName) {
    this.myJid = myJid;
    this.theirJid = theirJid;
    this.theirName = theirName;
    this.div = null;
    this.rttNode = null;
};

ChatView.prototype = {
    getJid: function() {
        return this.theirJid;
    },
    
    getId: function() {
        return this.div.attr("id");
    },
    
    create: function(panelId) {
        this.div = $('<div id="' + panelId + '" class="mc"><div class="msgbox"></div><textarea class="chatbox"></textarea></div>');
        return this.div;
    },

    remove: function() {
        this.div.remove();
        return this;
    },
    
    focusInput: function() {
        this.div.children(".chatbox").focus();
    },
    
    newRTTMessage: function(text) {
    },
    
    resetRTTMessage: function(text) {
    },
    
    editRTTMessage: function(text) {
        return this._refreshMessage(text);
    },
    
    bodyMessage: function(text) {
        this._populateMessageNode(text, "");
        this._scrollToBottom();
        this.rttNode = null;
        return this;
    },
    
    commitOwnMessage: function() {
        var chatbox = this.div.children(".chatbox");
        var text = chatbox.val();
        if (text.length > 0) {
            var node = this._makeMessageNode().addClass("me");
            node.children('div.f').text(this.myJid);
            node.children('div.m').text(text);
            if (this.rttNode !== null)
                this.div.children(".msgbox").append(this.rttNode.detach());
            this._scrollToBottom();
            chatbox.val("");
        }
        return text;
    },
    
    _refreshMessage: function(text) {
        this.rttNode = this._populateMessageNode(text, ' [TYPING]');
        this._scrollToBottom();
        return this;
    },
    
    _populateMessageNode: function(text, extraText) {
        var node = this.rttNode !== null? this.rttNode : this._makeMessageNode().addClass("you");
        var from = node.children('div.f').first();
        var newFrom = this.theirName + extraText;
        if (from.text() != newFrom)
            from.text(newFrom);
        var msg = node.children('div.m').first();
        if (msg.text() != text)
            node.children('div.m').text(text);
        return node;
    },
    
    _makeMessageNode: function() {
        var node = $('<div class="cm"><div class="f"></div><div class="m"></div></div>');
        this.div.children(".msgbox").append(node);
        return node;
    },
    
    _scrollToBottom: function() {
        var msgbox = this.div.children(".msgbox");
        var newScrollTop = msgbox.prop("scrollHeight") - msgbox.height();
        var oldScrollTop = msgbox.prop("scrollTop");
        if (oldScrollTop != newScrollTop)
            msgbox.prop("scrollTop", newScrollTop);
    },
};


var TabsView = function(roster, tabsNode) {
    this.roster = roster;
    this.myJid = null;
    this.tabsByJid = {};
    this.JidById = {};
    this.tabCounter = 0;
    tabsNode.children("ul").children().remove();
    tabsNode.children("div").remove();
    this.node = tabsNode.tabs();
    var self = this;
    tabsNode.find(".ui-tabs-nav").sortable({
        axis: "x",
        stop: function() {
          self.node.tabs("refresh");
        }
    });
    var that = this;
    tabsNode.on("tabsactivate", function(event, ui) {
        var newTab = that.findById(ui.newTab.attr("aria-controls"));
        newTab.focusInput();
    });
    tabsNode.children("ul.closable-tabs").on("keyup", "li", function(event) {
        if (event.altKey && event.which === $.ui.keyCode.BACKSPACE)
            that.close($(this).closest("li"));
    });
    tabsNode.children("ul.closable-tabs").on("click", "span.ui-icon-close", function(event) {
            that.close($(this).closest("li"));
    });
};

TabsView.prototype = {
    setMyJid: function(myJid) {
        this.myJid = myJid;
    },
    
    getContainer: function() {
        return this.node;
    },
    
    close: function(tabNode) {
        var panelId = tabNode.attr("aria-controls");
        var jid = this.JidById[panelId];
        var tabContent = this.tabsByJid[jid];
        this.node.trigger("tabclose", this.node.children('#' + panelId));
        tabNode.remove();
        tabContent.remove();
        delete this.tabsByJid[jid];
        delete this.JidById[panelId];
        this.node.tabs("refresh");
    },
    
    add: function(jid) {
        if (! this.tabsByJid.hasOwnProperty(jid)) {
            var ul = this.node.find(".ui-tabs-nav");
            var firstTab = ul.children().length == 0;
            var panelId = this.node.attr("id") + this.tabCounter++;
            var view = new ChatView(this.myJid, jid, this.getName(jid));
            this.tabsByJid[jid] = view;
            this.JidById[panelId] = jid;
            var li = $('<li>');
            li.append($('<a>').attr('href', '#' + panelId).text(jid));
            li.append('<span class="ui-icon ui-icon-close" role="presentation">Remove Tab</span>');
            this.node.find(".ui-tabs-nav").append(li);
            this.node.append(view.create(panelId));
            this.node.tabs("refresh");
            if (firstTab)
                this.activate(jid);
        }
        return this.tabsByJid[jid];
    },
    
    activate: function(jid) {
        var tab = this.find(jid);
        var ul = this.node.find(".ui-tabs-nav");
        var tabIndex = ul.children('li[aria-controls=' + tab.getId() + ']').index();
        this.node.tabs("option", "active", tabIndex);
    },
    
    find: function(jid) {
        if (! this.tabsByJid.hasOwnProperty(jid))
            this.add(jid);
        return this.tabsByJid[jid];
    },
    
    findById: function(id) {
        return this.tabsByJid[this.JidById[id]];
    },
    
    getName: function(jid) {
        var item = this.roster.getItemByJid(jid);
        if (item)
            return Roster.getName(item);
        else
            return jid;
    },
};


function onLoadCallback() {
    // TBD: Check if we're already logged in?
    gapi.auth.init(function() { $("#login-dialog").dialog("open"); });
    //gapi.auth.authorize({client_id: gapiClientId, scope: gapiScopes, immediate: true}, handleAuthResult);    
}

var rosterHeight = 0;
$(window).on("load", function() {
    rosterHeight = $("#roster").height();
});

$(document).ready(function() {
    var chatRoster = new Roster();
    var rosterView = new RosterView(chatRoster, $("#roster"));
    
    var tabs = $("#messages-tabs");
    var chatView = new TabsView(chatRoster, tabs);

    sessionController = new SessionController(chatRoster, rosterView, chatView, "div.mc .chatbox",
            function(controller) {
                // connect
                $("#login-dialog").dialog("close");
                $("#app-container").show();
                $("#roster-div").show();
                $("#roster").height(rosterHeight - $("#disconnect").outerHeight(true));
                $("#roster-title-text").text(Strophe.getBareJidFromJid(controller.connection.jid));
            },
            function () {
                // fail
                Trophy.log.warn("Failed to connect");
                $("#login-dialog").dialog("open");
                $("#roster-div").hide();
                $("#app-container").hide();
                $("#roster-title-text").text("Login");
            },
            function() {
                // disconnect
                location.reload();
                $("#login-dialog").dialog("open");
                $("#roster-div").hide();
                $("#app-container").hide();
                $("#roster-title-text").text("Login");
            });
    

    // Uncomment the following line to see all the debug output.
    //Strophe.log = function (level, msg) { log('LOG: ' + msg); };
    
    $("#login-dialog").dialog({
        modal: true,
        autoOpen: false,
        closeOnEscape: false,
        close: function() {
            $("#login-dialog p.spinner").css("visibility", "hidden");
        },
        open: function() {
            $("#login-dialog p.spinner").css("visibility", "hidden");
            $("#login-dialog").parent().find(".ui-dialog-titlebar-close").hide();
        },
        buttons: {
            "Sign in via Google": function() {
                $("#login-dialog p.spinner").css("visibility", "visible");
                gapi.auth.authorize({client_id: gapiClientId, scope: gapiScopes, immediate: false},
                        sessionController.handleAuthResult.bind(sessionController));
            }
        }
    });

    $("#disconnect").button();
    $("#disconnect").on("click", function() {
        sessionController.disconnect();
    });
    
    $(document).tooltip();
});

