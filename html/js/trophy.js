/*!
 * trophy.js - A real-time text plugin for strophe.js
 * Copyright © 2013 Christian Vogler
 * 
 * Designed for XEP-0301 -- Jabber/XMPP Extension Protocol
 * http://xmpp.org/extensions/xep-0301.html
 * 
 * Author: Christian Vogler <christian.vogler@gallaudet.edu>
 * Technology Access Program at Gallaudet University
 * http://tap.gallaudet.edu/
 * 
 * DESCRIPTION:
 *  -- Real-time text (RTT): Text transmitted instantly while it is being typed or created.
 *  The recipient can immediately read the sender's text as it is written, without waiting.
 *  -- Real-time text is used for general chat, improved text messaging, enhancement to instant messaging, 
 *  voice transcription, court reporting, streaming news tickers, IP relay services, live closed captioning 
 *  and live subtitles, gateways for TDD/TTY/text telephone for the deaf, captioned telephones, and more.
 *  This module is provided as a plugin for Strophe.js.
 *  -- For a FAQ, and for implementations in other languages (C#, Java, etc) see http://www.realjabber.org
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
 *   The development of this plugin was in part supported by funding from the
 *   National Institute on Disability and Rehabilitation Research, U.S. Department
 *   of Education, grant number H133E090001 (RERC on Telecommunications Access).
 *   However, this work does not necessarily represent the policy of the Department
 *   of Education, and you should not assume endorsement by the Federal Government.
 */
(function() {
Trophy = {
    // Public constants
    
    /**
     * Version
     */
    VERSION: "0.1",
    
    /**
     * Public event types
     */
    Event : {
        START_RTT : 0,
        STOP_RTT : 1,
        NEW_MESSAGE : 2,
        EDIT : 3,
        RESET : 4,
        BODY : 5,
        LOST_SYNC : 6
    },

    /**
     * Public RTT edit action types
     */
    Action : {
        INSERT : 0,
        ERASE : 1
    },
    
    /**
     * Public log levels
     */
    log : {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        OFF: 4
    },
    
    /**
     * Maximum action queue backlog in milliseconds
     */
    MAX_QUEUE_BACKLOG : 1000
};

// Internal shorthands for the event and action namespaces
var ev = Trophy.Event;
var ac = Trophy.Action;

// Private function: returns true if argument is undefined
var _undefined = function(arg) {
    return typeof arg === 'undefined';
};

// Private constant: _undef = undefined, ensuring that it works
// even if another script reassigned the reserved word "undefined"
var _undef = function(undef) {
    return undef;
}(); 

//private constant: AND mask for sequence counter rollover
var _seqMask = 0x7fffffff;

// Debugging facilities
var _debugF = null;
var _infoF = null;
var _warnF = null;
var _errorF = null;
if (! _undefined(window.console) && ! _undefined(window.console.log)) {
    // Browser supports at least console.log
    // The call to Function.prototype.call.bind ensures that the available
    // console functionality under IE developer tools will work with variable arguments
    // and apply(), because IE's console.log does not follow the Function.prototype interface.
    // 
    var _logF = Function.prototype.call.bind(window.console.log, window.console);
    _debugF = ! _undefined(window.console.debug)? Function.prototype.call.bind(window.console.debug, window.console) : function() { _logF.apply(console.log, arguments); };
    _infoF = ! _undefined(window.console.info)? Function.prototype.call.bind(window.console.info, window.console) : function() { _logF.apply(console.log, arguments); };
    _warnF = ! _undefined(window.console.warn)? Function.prototype.call.bind(window.console.warn, window.console) : function() { _logF.apply(console.log, arguments); };
    _errorF = ! _undefined(window.console.error)? Function.prototype.call.bind(window.console.error, window.console) : function() { _logF.apply(console.log, arguments); };
}
else {
    // Browser does not support console.log - logging is a no-op (i.e. unavailable)
    _debugF = function() {};
    _infoF = function() {};
    _warnF = function() {};
    _errorF = function() {};
}
// Private function to log to the specified logger (_info, _debug, _warn, ...)
//with an accompanying timestamp
var _timedLogF = function(logger) {
    var args = Array.prototype.slice.call(arguments, 1);
    args[0] = "Time: %d - " + args[0];
    args.splice(1, 0, new Date().getTime());
    logger.apply(window, args);
};

// Private shorthand functions for internal logging -
// depending on log level, these forward to the approrpiate console.log
// or are no-ops.
var _debug = null;
var _info = null;
var _warn = null;
var _error = null;
var _timedLog = null;

// Private function to parse XML
// See http://stackoverflow.com/questions/649614/xml-parsing-of-a-variable-string-in-javascript/8412989#8412989
var _parseXml;
if (typeof window.DOMParser != "undefined") {
    _parseXml = function(xmlStr) {
        return (new window.DOMParser()).parseFromString(xmlStr, "text/xml");
    };
}
else if (typeof window.ActiveXObject != "undefined" &&
       new window.ActiveXObject("Microsoft.XMLDOM")) {
    _parseXml = function(xmlStr) {
        var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = false;
        xmlDoc.preserveWhiteSpace = true;
        xmlDoc.loadXML(xmlStr);
        return xmlDoc;
    };
} else {
    throw new Error("No XML parser found");
}

// Private function to check if a DOM node has a specified attribute. The reason for
// implementing it:
// IE <= 9 doesn't seem to support hasAttribute() in DOMs retrieved via XMLHttpRequests.
// We define hasAttribute() under the assumption that an attribute is never null.
var _hasAttribute = function(elem, attr) {
    return elem.getAttribute(attr) !== null;
};

/**
 * Private helper function: convert String to Unicode char array
 * Adapted from getWholeCharacter() at
 * https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/charAt
 */
var _UTF16StringToArray = function(utf16string) {
    var array = [];
    for ( var i = 0; i < utf16string.length; i++) {
        var code = utf16string.charCodeAt(i);
        if (code < 0xD800 || code > 0xDFFF) {
            // simple 16-bit code, no surrogate
            array.push(utf16string.charAt(i));
        } else {
            if (0xD800 <= code && code <= 0xDBFF) {
                // High surrogate (could change last hex to 0xDB7F to treat
                // high private surrogates as single characters)
                if (utf16string.length <= i + 1) {
                    throw 'Unicode error: High surrogate without following low surrogate';
                }
                var next = utf16string.charCodeAt(i + 1);
                if (0xDC00 > next || next > 0xDFFF) {
                    throw 'Unicode error: High surrogate without following low surrogate';
                }
                array.push(utf16string.charAt(i)
                        + utf16string.charAt(i + 1));
                // skip the low surrogate in loop
                i++;
            } else {
                // Low surrogate (0xDC00 <= code && code <= 0xDFFF)
                // - this should never happen. We should previously have
                // seen
                // a high surrogate
                throw 'Unicode error: Low surrogate without preceding high surrogate';
            }
        }
    }
    return array;
};


/**
 * Public function: sets the logging level
 * @param level {Integer} is one of the Trophy.log constants
 *         Only events >= the specified log level are logged
 * 
 * Also sets up public logging functions: Trophy.log.debug,
 * Trophy.log.info, ... - these are always callable even if the
 * browser does not support logging.
 * By default the log level is off, so no logging is performed.
 */
Trophy.log.setLogLevel = function(level) {
    Trophy.log.debug = _debug = level <= Trophy.log.DEBUG? _debugF : function() {};
    Trophy.log.info = _info = level <= Trophy.log.INFO? _infoF : function() {};
    Trophy.log.warn = _warn = level <= Trophy.log.WARN? _warnF : function() {};
    Trophy.log.error = _error = level <= Trophy.log.ERROR? _errorF : function() {};
    Trophy.log.timedLog = _timedLog = level != Trophy.log.OFF?  _timedLogF : function() {};
};

/// sets default log level
Trophy.log.setLogLevel(Trophy.log.OFF);

/**
 * Public helper function to parse string into XML DOM. This
 * function exists to make writing unit tests easier.
 * 
 * @param xmlStr {String} is the XML string to parse
 * @returns {Object} the DOM node corresponding to the XML
 */
Trophy.parseXML = _parseXml;


/**
 * Helper function for calculating the difference between two strings
 * as inserts/erases. This function does not use the full Levenshtein
 * measure, due to space and time constraints. Rather, it assumes that
 * any change is localized to at most one insert/erase, or substitution.
 * This is not optimal in terms of minimal edits, but can be implemented
 * in O(n) time and O(1) space.
 * 
 * @param oldStr {String or Trophy.UnicodeCharArray} is the reference string
 * @param newStr {String or Trophy.UnicodeCharArray} is the replacement string
 * 
 * @returns {
 *     erase: [pos, numChars]  - the erase action
 *     insert: [pos, text] - the insert action
 * }
 * where the parameters are the same as for RTTBuffer erase/insert. The
 * erase action is assumed to happen before the insert action. If set to null,
 * no such action took place.
 */
Trophy.stringDiff = function(oldStr, newStr) {
    var maxFwd = Math.min(oldStr.length, newStr.length);
    var matchFwd;
    for (matchFwd = 0; matchFwd < maxFwd; matchFwd++)
        if (oldStr.charAt(matchFwd) !== newStr.charAt(matchFwd))
            break;
    var maxBack = maxFwd - matchFwd;
    var matchBack;
    for (matchBack = 0; matchBack < maxBack; matchBack++)
        if (oldStr.charAt(oldStr.length - matchBack - 1) !== newStr.charAt(newStr.length - matchBack - 1))
            break;
    // matchFwd now contains the length of the common substring at the beginning
    // matchBack now contains the length of the common substring at the end
    var result = {
        erase: null,
        insert: null
    };
    var matchLen = matchFwd + matchBack;
    if (matchLen < oldStr.length) {
        // part of the text was erased
        result.erase = [oldStr.length - matchBack, oldStr.length - matchLen];
    }
    if (matchLen < newStr.length) {
        // we had an insertion of new text
        result.insert = [matchFwd, newStr.substring(matchFwd, matchFwd + newStr.length - matchLen)];
    }
    return result;
};

/**
 * Private class: Trophy.WallClockEventQueue
 * 
 * This class provides a queue for triggering events at a specific wall
 * clock time, rather than relative delays.
 * 
 * Assumptions:
 * - The wall clock times increase monotonically in the order in which
 *   events are placed in the queue.
 *   
 * - The browser's clock is well-behaved, in that timestamps always
 *   increase, never decrease.
 */
/**
 * Constructor: Trophy.WallClockEventQueue
 */
Trophy.WallClockEventQueue = function() {
    this.timeBase = new Date().getTime();
    this.lastInsertionOffset = 0;
    this.queue = [];
    this.timer = null;
    this.isStarted = false;
};

Trophy.WallClockEventQueue.prototype = {
    /**
     * Starts the queue
     * 
     * @returns {Trophy.WallClockEventQueue} this queue
     */
    start : function() {
        this.isStarted = true;
        this._startTimer();
        return this;
    },

    /**
     * Stops the queue. Pending hasMore callbacks are not affected and will
     * be processed even after the stop.
     * 
     * @returns {Trophy.WallClockEventQueue} this queue
     */
    stop : function() {
        this._stopTimer();
        this.isStarted = false;
        return this;
    },

    /**
     * Clears the queue. Does not affect the running status of the queue.
     * Pending hasMore callbacks are discarded.
     * 
     * @param {Integer} lastInsertionTime if defined, set the last insertion
     *                  time to this, else to the current time.
     * @returns {Trophy.WallClockEventQueue} this queue
     */
    clear : function(lastInsertionTime) {
        this._stopTimer();
        this.queue = [];
        this.lastInsertionOffset = _undefined(lastInsertionTime)? new Date().getTime() - this.timeBase : lastInsertionTime - this.timeBase;
        return this;
    },

    /**
     * Puts a new callback onto the queue
     * 
     * @param targetTime
     *            {Integer} the timestamp at which to trigger the callback
     * @param callback
     *            {Function} the callback function, which takes the
     *            arguments:
     *                {Integer} the targetTime parameter, as above
     *                {Boolean} hasMore - true if more callbacks at the current
     *                                    time are pending. Can be used to
     *                                    merge actions from successive
     *                                    callbacks.
     * @returns {Trophy.WallClockEventQueue} this queue
     */
    enqueue : function(targetTime, callback) {
        if (targetTime < this.timeBase + this.lastInsertionOffset)
            throw 'Trophy.TimeOrderingViolation: ' + targetTime + ' < '
                    + (this.timeBase + this.lastInsertionOffset);
        this.queue.push({
            targetTime : targetTime - this.timeBase,
            callback : callback
        });
        this.lastInsertionOffset = targetTime - this.timeBase;
        this._startTimer();
        return this;
    },

    /**
     * Removes the callback at the front of the queue without triggering it.
     * 
     * @returns {Trophy.WallClockEventQueue} this queue
     */
    dequeue : function() {
        if (this.queue.length > 0) {
            this._stopTimer();
            this.queue.shift();
            this._startTimer();
        }
        return this;
    },

    /**
     * @returns {Boolean} true if the queue is running
     */
    isRunning : function() {
        return this.isStarted;
    },

    /**
     * @returns {Integer} the number of callbacks in the queue
     */
    length : function() {
        return this.queue.length;
    },
    
    /**
     * @ returns {Integer} the backlog in this queue in milliseconds
     */
    backlog : function() {
        var backlog = 0;
        var len = this.queue.length;
        if (len > 0) {
            var now = new Date().getTime();
            backlog = this.timeBase + this.queue[len - 1].targetTime - now;
        }
        return backlog;
    },

    /**
     * @returns {Object} the first callback in the queue, or null if the
     *          queue is empty, in the format:
     *              Object {
     *                       targetTime: {Integer} the callback timestamp
     *                       callback: {Function} the callback function
     *              }
     */
    top : function() {
        return this.queue.length > 0 ? this.queue[0] : null;
    },
    
    /**
     * Reduces the backlog. Any items that are backlogged more than the new
     * maximum backlog will be triggered immediately.
     * 
     * @param maxBacklog {Integer} the maximum backlog the queue can have
     *          after this call. If the backlog is less than this value,
     *          this function is a no-op.
     * @returns {Trophy.WallClockEventQueue} this queue
     */
    reduceBacklog : function(maxBacklog) {
        var len = this.queue.length;
        if (len > 0) {
            var now = new Date().getTime();
            var backlog = this.timeBase + this.queue[len - 1].targetTime - now;
            if (backlog > maxBacklog) {
                this.timeBase -= backlog - maxBacklog;
                // Restart timer to ensure that any now-pending events are triggered
                this._stopTimer();
                this._startTimer();
            }
        }
        return this;
    },
    
    // Private function: starts the event queue's timer
    _startTimer : function() {
        var that = this;
        if (that.isStarted && that.timer === null && that.queue.length > 0) {
            var delta = Math.max(1, this.timeBase + that.queue[0].targetTime
                    - (new Date().getTime()));
            that.timer = setTimeout(function() {
                that.timer = null;
                that._processQueue();
                that._startTimer();
            }, delta);
        }
    },

    // Private function: stops the event queue's timer
    _stopTimer : function() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },
    
    // Private function: Process all pending events up to the
    // current time, and trigger callbacks
    _processQueue : function() {
        var now = new Date().getTime();
        // we recheck the conditions here, because during a callback in the
        // loop, the queue
        // could have been manipulated.
        while (this.queue.length > 0 && this.timeBase + this.queue[0].targetTime <= now) {
            var top = this.queue[0];
            this.queue.shift();
            var hasMore = this.queue.length > 0
                    && this.timeBase + this.queue[0].targetTime <= now;
            top.callback(this.timeBase + top.targetTime, hasMore);
        }
    }
};


/**
 * Private class: Array of Unicode chars. It handles surrogate pairs
 * correctly.
 */
/**
 * Constructor: Creates a new Unicode char array
 * 
 * @param utf16stringOrArray
 *            {String or Array} is a Javascript string or an Array of
 *                              Unicode chars. In the latter case, 
 *                              the array is used unmodified.
 */
Trophy.UnicodeCharArray = function(utf16stringOrArray) {
    if (! (utf16stringOrArray instanceof Array))
        this.array = _UTF16StringToArray(utf16stringOrArray);
    else
        this.array = utf16stringOrArray;
    this.length = this.array.length;
};

Trophy.UnicodeCharArray.prototype = {
    /**
     * Converts the array back to an UTF-16 string
     * 
     * @returns {String} the array as a string
     */
    toString : function() {
        return this.array.join('');
    },

    /**
     * @returns {Array} the raw array of Unicode characters
     */
    getRawArray : function() {
        return this.array;
    },
    
    /**
     * Inserts the contents of string/raw Unicode character array into the array
     * 
     * @param pos
     *            {Integer} is the position at which to insert
     * @param string
     *            {String or Array} is the UTF-16 string to
     *                insert or an array of Unicode characters
     * @returns {Trophy.UnicodeCharArray} this instance
     */
    insert : function(pos, stringOrArray) {
        pos = Math.min(this.array.length, Math.max(0, pos));
        var otherArray = stringOrArray;
        if (typeof otherArray === 'string' || otherArray instanceof String)
            otherArray = _UTF16StringToArray(otherArray);
        if (pos >= this.array.length) {
            // append to end
            this.length = this.array.push.apply(this.array, otherArray);
        } else if (pos == 0) {
            // append to beginning
            this.length = this.array.unshift.apply(this.array, otherArray);
        } else {
            // splice new contents in
            var args = otherArray.slice();
            // ad first two arguments to splice()
            args.unshift(pos, 0);
            this.array.splice.apply(this.array, args);
            this.length = this.array.length;
        }
        return this;
    },

    /**
     * Removes characters with standard Javascript string semantics
     * 
     * @param pos
     *            {Integer} is the position at which to remove
     * @param numChars
     *            {Integer} specifies how many characters to remove
     *                  *after* (not before!) pos
     * @returns {Trophy.UnicodeCharArray} this instance
     */
    remove : function(pos, numChars) {
        pos = Math.min(this.array.length - 1, Math.max(0, pos));
        numChars = Math.min(numChars, this.array.length - pos);
        this.array.splice(pos, numChars);
        this.length = this.array.length;
        return this;
    },

    /**
     * Erases all characters in this array
     * 
     * @returns {Trophy.UnicodeCharArray} this instance
     */
    clear : function() {
        this.array = [];
        this.length = 0;
        return this;
    },
    
    /**
     * Clones this UnicodeCharArray
     * 
     * @returns {Trophy.UnicodeCharArray} a deep copy of this UnicodeCharArray
     */
    clone : function() {
        return new Trophy.UnicodeCharArray(this.array.slice());
    },
    
    /**
     * Obtains the UTF-16 character at the specified index
     * @param index {Integer} is the index 
     * @returns {String} the character/surrogate pair
     */
    charAt : function(index) {
        return this.array[index];  
    },
    
    /**
     * Extracts a substring from this array with standard JS string semantics
     * @param start {Integer} is the start position of the substring
     * @param end {Integer} is the end position of the substring (one past the end)
     * @returns {Trophy.UnicodeCharArray} the substring
     */
    substring : function(start, end) {
        return new Trophy.UnicodeCharArray(this.array.slice(start, end));
    }
};


/**
 * Public class: Real-time text buffer This class offers a 1:1 mapping
 * between XEP-0301 edit elements and the RTT that should be displayed to
 * the user. If RTT is active (implied by starting a new RTT message), the
 * buffer is populated at the times specified by the XEP-0301 stanzas, and
 * event callbacks are initiated to any callback listeners that have
 * registered. The event callbacks are of the types defined above in
 * Trophy.Event, and have the following meaning:
 * 
 * START_RTT:   Triggered when RTT was inactive and is now active. Any such
 *              trigger happens before NEW_MESSAGE.
 *              
 * STOP_RTT:    Triggered when RTT is inactive. The text buffer is also cleared
 *              at that time.
 *              
 * NEW_MESSAGE: Triggered when a new RTT message is started. *DOES NOT CLEAR* the
 *              buffer imemdiately, but inserts an erase all action into the buffer's
 *              action queue.
 *              
 * EDIT:        Triggered when the contents of the text buffer change. Successive
 *              edits that happen at adjacent times in the action queue result in
 *              only one trigger of EDIT.
 * 
 * RESET:       Triggered on a reset (for resynchronization) of the RTT
 *              message. *DOES NOT CLEAR* the buffer imemdiately, but
 *              inserts an erase all action into the buffer's action queue.
 * 
 * BODY:        Triggered when the RTT message is complete and has been
 *              transmitted as a whole. *DOES NOT CLEAR* the buffer.
 *              
 * LOST_SYNC:   Triggered when the RTT data exchange got out of sync.
 *              All RTT activity is paused until the next reset, except for
 *              already pending events in the action queue. This trigger always
 *              happens *after* all pending events have been cleared.
 *              *DOES NOT CLEAR* the buffer.
 */
/**
 * Constructor: RTTBuffer
 */
Trophy.RTTBuffer = function() {
    this.eventQueue = new Trophy.WallClockEventQueue();
    // As Javascript stores strings as UTF-16, characters may have
    // variable lengths. We keep the text buffer as an array representing
    // full UTF-16 surrogate pairs (which are 1:1 correspondeces to Unicode
    // codepoints) to work around this problem.
    this.textBuffer = new Trophy.UnicodeCharArray("");
    this.timebase = 0;
    this.timeOffset = 0;
    this.eventListeners = [];
    // Set to true if edit events have been applied to the buffer, but the
    // Trophy.Event.EDIT has not yet been triggered.
    this.pendingEditEvents = false;
};

Trophy.RTTBuffer.prototype = {
    /**
     * Adds a new event listener callback.
     * The callback receives the following parameters:
     *      event {Integer} the event type (as listed above in the class description)
     *      buffer {UnicodeCharArray} the contents of the RTT buffer
     *  
     * @param listener {Function} is the event listener callback
     * @returns {Trophy.RTTBuffer} this instance
     */
    addEventListener : function(listener) {
        this.eventListeners.push(listener);
        return this;
    },

    /**
     * @returns {Boolean} true if the RTT buffer is currently active and taking edits
     */
    isActive : function() {
        return this.eventQueue.isRunning();
    },

    /**
     * @returns {Trophy.UnicodeCharArray} the contents of the RTT buffer
     */
    getText : function() {
        return this.textBuffer;
    },

    /**
     * Initiates a new RTT message; corresponds to event=new in XEP-0301.
     * Also implies a RTT start if RTT currently was inactive. All pending
     * events are cleared, and the buffer is cleared as part of an action
     * queue event.
     * @param timebase {Integer} is the clock time relative to which all edit
     *            events happen subsequently. Recommend to set this value to the
     *            time the stanza containing event=new arrived. If undefined,
     *            it is set to the current time.
     * @returns {Trophy.RTTBuffer} this instance
     */
    newRTTMessage : function(timebase) {
        this._restart(ev.NEW_MESSAGE, timebase);
        return this;
    },

    /**
     * Stops RTT handling and clears the event queue.
     * @returns {Trophy.RTTBuffer} this instance
     */
    stopRTT : function() {
        if (this.eventQueue.isRunning()) {
            this.pendingEditEvents = false;
            this.eventQueue.stop();
            this.eventQueue.clear();
            this.textBuffer.clear();
            this._triggerEvents(ev.STOP_RTT);
        }
        return this;
    },

    /**
     * Inserts text at the specified position. The meaning of the positions
     * is the same as for the <t> element in XEP-0301, and the intent of the
     * function is to act as a direct counterpart to this element.
     * @param pos {Integer} is the position before which to insert. If undefined,
     *            the text is appended.
     * @param text {String or Array of Unicode surrogates} is the text to insert. If
     *            undefined, it defaults to the empty text.
     * @returns {Trophy.RTTBuffer} this instance
     */
    insert : function(pos, text) {
        if (_undefined(text))
            text = '';
        // We perform this conversion now, because odds are that due to
        // preserving keypress intervals, as per XEP-0301, is enabled,
        // and thus the insertion callback will happen some time in the future.
        // In this case, converting now reduces latency at callback time.
        var unicodeText = _UTF16StringToArray(text);
        var targetTime = this.timebase + this.timeOffset;
        var that = this;
        this.eventQueue.enqueue(targetTime, function(timestamp, hasMore) {
            if (_undefined(pos))
                pos = that.textBuffer.length;
            that.textBuffer.insert(pos, unicodeText);
            if (!hasMore) {
                that._triggerEvents(ev.EDIT);
                that.pendingEditEvents = false;
            }
            else
                that.pendingEditEvents = true;
        });
        return this;
    },

    /**
     * Erases text. This function corresponds to the <e> element in XEP-0301,
     * and the position parameter behaves the same as for this element.
     * @param pos {Integer} is the position before which to erase numChars
     *              characters. If undefined, it defaults to the end of the
     *              current text.
     * @param numChars {Integer} is the number of characters to erase. If
     *              undefined, it defaults to 1.
     * @returns {Trophy.RTTBuffer} this instance
     */
    erase : function(pos, numChars) {
        var targetTime = this.timebase + this.timeOffset;
        var that = this;
        this.eventQueue.enqueue(targetTime, function(timestamp, hasMore) {
            if (_undefined(pos))
                pos = that.textBuffer.length;
            if (_undefined(numChars))
                numChars = 1;
            var firstErasedCharPos = pos - numChars;
            that.textBuffer.remove(firstErasedCharPos, numChars);
            if (!hasMore) {
                that._triggerEvents(ev.EDIT);
                that.pendingEditEvents = false;
            }
            else
                that.pendingEditEvents = true;
        });
        return this;
    },

    /**
     * Inserts a wait into the event queue before the next event enqueued afterward
     * triggers. This function corresponds to the <w> element in XEP-0301.
     * @param milliseconds {Integer} the wait in milliseconds.
     * @returns {Trophy.RTTBuffer} this instance
     */
    wait : function(milliseconds) {
        this.timeOffset += milliseconds;
        return this;
    },

    /**
     * Resets the RTT buffer contents to a known value, with the RTT still in
     * progress. Corresponds to the event=reset in XEP-0301. All pending
     * events are cleared, and the buffer is cleared as part of an action
     * queue event.
     * @param timebase {Integer} is the clock time relative to which all edit
     *            events happen subsequently. Recommend to set this value to the
     *            time the stanza containing event=new/reset arrived. If undefined,
     *            it is set to the current time.
     * @returns {Trophy.RTTBuffer} this instance
     */
    reset : function(timebase) {
        this._restart(ev.RESET, timebase);
        return this;
    },

    /**
     * Finalizes a RTT message and sets the RTT buffer contents to a known value.
     * Corresponds to the body element in XEP-0301. All pending
     * events are cleared.
     * @param message {String or Array of Unicode surrogates} are the new contents of the RTT
     *            buffer.
     * @returns {Trophy.RTTBuffer} this instance
     */
    body : function(message) {
        this.pendingEditEvents = false;
        this.timebase = 0;
        this.timeOffset = 0;
        this.eventQueue.clear();
        this.textBuffer.clear();
        this.textBuffer.insert(0, message);
        this._triggerEvents(ev.BODY);
        return this;
    },

    /**
     * Indicates that synchronization of RTT events has been lost. RTT
     * processing must be halted until the next reset/body/new event is received.
     * Pending events are still processed, however.
     * 
     * @returns {Trophy.RTTBuffer} this instance
     */
    syncLost : function() {
        var targetTime = this.timebase + this.timeOffset;
        var that = this;
        this.eventQueue.enqueue(targetTime, function(timestamp, hasMore) {
            if (that.pendingEditEvents) {
                // Make sure that all edit events are triggered first, if
                // any information remained in the queue that resulted
                // in hasMore being true in the insert/erase callbacks.
                that._triggerEvents(ev.EDIT);
                that.pendingEditEvents = false;
            }
            that._triggerEvents(ev.LOST_SYNC);
        });
        return this;
    },
    
    /**
     * Synchronizes the event queue's timebase to the current time, or
     * the specified time. Any actions take place relative to this time
     * base.
     * 
     * @param timebase {Integer} is the time base to sync to or undefined for current
     *          time.
     */
    syncTime: function(timebase) {
        if (_undefined(timebase))
            timebase = new Date().getTime();
        // We have to make sure that any event from a new message
        // happens after the last queued event
        this.timebase = Math.max(timebase, this.timebase + this.timeOffset);
        this.timeOffset = 0;
    },
    
    /**
     * Eliminates the excess backlog in this buffer's action queue.
     * By default this is the value of Trophy.MAX_QUEUE_BACKLOG.
     */
    eliminateExcessBacklog : function(maxBacklog) {
        if (_undefined(maxBacklog))
            maxBacklog = Trophy.MAX_QUEUE_BACKLOG;
        this.eventQueue.reduceBacklog(maxBacklog);
    },

    // Private function: (re)starts the action queue after a new/reset
    // It captures the common processing rule between event=new/reset as
    // per the spec.
    _restart : function(eventType, timebase) {
        this.syncTime(timebase);
        // We must pass the time base for clearing, because there could
        // be a clock tick between the sync and the clearing of the queue.
        this.eventQueue.clear(timebase);
        if (!this.eventQueue.isRunning()) {
            this.pendingEditEvents = false;
            this._triggerEvents(ev.START_RTT);
            this.eventQueue.start();
        }
        this._triggerEvents(eventType);
        // clear the text buffer via an edit event. Because edit events adjacent in
        // time are merged, this erase will be merged with any pending inserts immediately
        // after the message refresh. This avoids triggering an event with an empty
        // text buffer, followed by another separated edit event, which could result
        // in nasty flickering on the screen.
        if (this.textBuffer.length > 0)
            this.erase(this.textBuffer.length, this.textBuffer.length);
    },

    // private function: triggers a specified event for all event listeners
    _triggerEvents : function(eventType) {
        for ( var i = 0; i < this.eventListeners.length; i++)
            this.eventListeners[i](eventType, this.textBuffer);
    }
};


/**
 * Public class: Real-time text send queue. This queue enqueues real-time text
 * actions, with the time intervals between them preserved.
 * Conceptually the queue always keeps two text buffers around: the text as before
 * the actions in the queue are applied, and the text after the actions are applied.
 */
/**
 * Constructor
 */
Trophy.RTTSendQueue = function() {
    this.actions = [];
    this.preQueueText = new Trophy.UnicodeCharArray("");
    this.postQueueText = new Trophy.UnicodeCharArray("");
    this.lastAction = new Date().getTime();
    this.newMessage = true;
    this.activityListeners = [];
};

Trophy.RTTSendQueue.prototype = {
    /**
     * Adds an activity listener to the send queue. Such listeners are
     * triggered when the send queue acquires new actions (but not when
     * it is cleared or flushed).
     * @param listener {Function} the listener callback
     *           It takes one argument:
     *              queue {Trophy.RTTSendQueue} this queue
     */
     addActivityListener: function(listener) {
         this.activityListeners.push(listener);
     },
     
    /**
     * Enqueues an insert action at the current time. The action is kept as
     * minimal as possible, with undefined representing the defaults as per the
     * XEP-0301 spec.
     * @param pos {Integer} is the position after which to insert. If undefined,
     *                it is past the end of the current text.
     * @param stringOrArray {String or Array of surrogates} is the string to insert.
     *                If undefined, it is the empty string.
     * @returns {Trophy.RTTSendQueue} this instance
     */
    insert: function(pos, stringOrArray) {
        var postQueueTextLen = this.postQueueText.length;
        var insertArray = _undefined(stringOrArray)? '' : stringOrArray;
        var insertPos = _undefined(pos)? postQueueTextLen : pos;
        if (insertArray.length > 0) {
            if (typeof insertArray === 'string' || insertArray instanceof String)
                insertArray = _UTF16StringToArray(insertArray);
            else
                // This is a raw character array
                stringOrArray = insertArray.join('');
            this.postQueueText.insert(insertPos, insertArray);
        }
        this._addAction({
            action: ac.INSERT,
            pos: insertPos === postQueueTextLen? _undef : pos,
            text: insertArray.length === 0? _undef : stringOrArray
        });
        return this;
    },
    
    /**
     * Enqueues an erase action at the current time. The action is kept as
     * minimal as possible, with undefined representing the defaults as per the
     * XEP-0301 spec.
     * @param pos {Integer} is the position before which to erase. If undefined,
     *              it is set to the end of the current text.
     * @param numChars {Integer} is the number of characters to erase. If undefined,
     *              it is set to 1.
     * @returns {Trophy.RTTSendQueue} this instance.
     */
    erase: function(pos, numChars) {
        var postQueueTextLen = this.postQueueText.length;
        var eraseNumChars = _undefined(numChars)? 1 : numChars;
        var erasePos = _undefined(pos)? postQueueTextLen : pos; 
        var firstErasedCharPos = erasePos - eraseNumChars;
        this.postQueueText.remove(firstErasedCharPos, eraseNumChars);
        this._addAction({
           action: ac.ERASE,
           pos: erasePos === postQueueTextLen? _undef : erasePos,
           numChars: eraseNumChars == 1? _undef : eraseNumChars
        });
        return this;        
    },
    
    /**
     * Enqueues a sequence of erases and inserts that transform the text in the
     * send queue to the new one provided. This function is the easiest way to update
     * the RTT send queue with text entered in a GUI.
     * @param text {String or Array of surrogates} is the new text into which to transform.
     * @returns {Trophy.RTTSendQueue} this instance.
     */
    edit: function(text) {
        if (typeof text === 'string' || text instanceof String)
            text = new Trophy.UnicodeCharArray(text);
        var diff = Trophy.stringDiff(this.postQueueText, text);
        if (diff.erase !== null)
            this.erase(diff.erase[0], diff.erase[1]);
        if (diff.insert !== null)
            this.insert(diff.insert[0], diff.insert[1].getRawArray());
        return this;
    },
    
    /**
     * Applies all pending actions in the send queue to  the pre-action
     * text buffer. After this function returns, the pre-and post-action
     * text buffer are identical.
     * @returns {Trophy.RTTSendQueue} this instance.
     */
    flush: function() {
        this.actions = [];
        this.newMessage = false;
        this.preQueueText = this.postQueueText.clone();
        return this;
    },
    
    /**
     * Clears the send queue. All pending actions are cleared, and the running
     * text is set to the empty string. This function should be called after
     * sending a <body> stanza.
     * @returns {Trophy.RTTSendQueue} this instance.
     */
    clear: function() {
        this.actions = [];
        this.preQueueText.clear();
        this.postQueueText.clear();
        this.newMessage = true;
        return this;
    },
    
    /**
     * @returns {Array} the action queue
     */
    getActions: function() {
        return this.actions;
    },
    
    /**
     * @returns {Trophy.UnicodeCharArray} the state of the send buffer *before*
     *              any actions are applied.
     */
    getPreQueueText: function() {
        return this.preQueueText;
    },
    
    /**
     * @returns {Trophy.UnicodeCharArray} the state of the send buffer *after*
     *              all actions are applied.
     */
    getPostQueueText: function() {
        return this.postQueueText;
    },
    
    /**
     * @returns {Integer} the timestamp of the most recent enqueued send action
     */
    getLastActionTimestamp: function () {
        return this.lastAction;
    },
    
    /**
     * @returns {Boolean} true if the current state of the send queue starts a
     *              new message. This is the case if the queue has not been flushed
     *              since the last clear().
     */
    isNewMessage: function() {
        return this.newMessage;
    },
    
    // Private function: enqueues the specified action at the current time
    _addAction: function(action) {
        var timestamp = new Date().getTime();
        action.timestamp = timestamp;
        this.actions.push(action);
        this.lastAction = timestamp;
        for (var i = 0; i < this.activityListeners.length; i++)
            this.activityListeners[i](this);
    }
};

/**
 * Class to keep track of the RTT send and receive states for a specific
 * bare JID. This class also is responsible for encoding and decoding XEP-0301
 * elements to and from the internal representation.
 */
/**
 * Constructor for a RTT context. Each bare JID has only one context, but the
 * context keeps track of the most recently encountered full JID, so that it can
 * detect out-of-sync RTT stanzas by both JID and sequence number.
 * @param fullJID {String} is the full JID from which the most recent stanza was received
 * @param rttBuffer {RTTBuffer} is the RTT receive buffer associated with the context.
 *                      If undefined, a new buffer is created.
 * @param sendQueue {RTTSendQueue} is the RTT send queue associated with the context.
 *                      If undefined, a new buffer is created.
 */
Trophy.RTTContext = function(fullJID, rttBuffer, sendQueue) {
    this.fullJID = fullJID;
    this.receiveSequence = null;
    this.sendSequence = null;
    this.rttBuffer = _undefined(rttBuffer)? new Trophy.RTTBuffer() : rttBuffer;
    this.sendQueue = _undefined(sendQueue)? new Trophy.RTTSendQueue() : sendQueue;
    this.lastReceiveActive = null;
    this.lastSendReset = null;
};

Trophy.RTTContext.prototype = {
    /**
     * @returns {Integer} the most recently encountered full JID for this
     *            context
     */
    getJID: function() {
        return this.fullJID;
    },
    
    /**
     * @returns {Trophy.RTTBuffer} the RTT receive buffer associated with this
     *            context
     */
    getRTTBuffer: function() {
        return this.rttBuffer;
    },
    
    /**
     * @returns {Trophy.RTTSendQueue} the RTT send queue associated with this
     *             context
     */
    getSendQueue: function() {
        return this.sendQueue;
    },
    
    /**
     * @returns {Integer} the time when the last reset/new event was sent over the
     *             wire.
     */
    getLastSendReset : function() {
        return this.lastSendReset;
    },
    
    /**
     * Adds an event listener to the RTT receive buffer. It is called on every
     * RTTBuffer event. Note that the signature of this event listener is different,
     * and adds itself and its bare JID to the list of passed parameters.
     * @param listener {Function} is the event listener with the following signature:
     *                 function(jid, event, context):
     *                     jid {Integer} is the bare JID associated with the receive buffer
     *                     event {Integer} is one of Trophy.Event, as in Trophy.RTTBuffer
     *                     text {String} is the content of the RTT buffer
     *                     context {Trophy.RTTContext} is this RTT context
     */
    addReceiveEventListener: function(listener) {
        var jid = Strophe.getBareJidFromJid(this.fullJID);
        var that = this;
        this.rttBuffer.addEventListener(function(event, unicodeText) {
            listener(jid, event, unicodeText.toString(), that);
        });
    },
    
    /**
     * Decodes a DOM representing a received rtt/body stanza and updates
     * the RTT receive buffer with the decoded actions. If the stanza
     * contains errors or has a sequence mismatch, the SYNC_LOST event is
     * triggered in the RTT receive buffer.
     * @param fullJID {Integer} is the full JID as in the from field of the stanza 
     * @param stanza {Node} is the DOM node representing the stanza
     * @returns {Trophy.RTTContext} this instance.
     */
    decodeMessage: function(fullJID, stanza) {
        var timestamp = new Date().getTime();
        this.rttBuffer.syncTime(timestamp);
        this.lastReceiveActive = timestamp;
        var that = this;
        Strophe.forEachChild(stanza, null, function(elem) {
            if (Strophe.isTagEqual(elem, "rtt") && 
                elem.getAttribute("xmlns") === Strophe.NS.RTT) {
                var seq = parseInt(elem.getAttribute("seq"));
                var event = null;
                if (_hasAttribute(elem, "event"))
                    event = elem.getAttribute("event");
                if (event === null || event === "edit")
                    that._decodeEdit(fullJID, seq, elem);
                else if (event === "new")
                    that._decodeNewMessage(seq, timestamp, elem);
                else if (event === "reset")
                    that._decodeReset(seq, timestamp, elem);
                else if (event === "init") {
                    // TODO
                }
                else if (event === "cancel") {
                    // TODO
                }
            }
            else if (Strophe.isTagEqual(elem, "body")) {
                that._decodeBody(elem);
            }
        });
        this.rttBuffer.eliminateExcessBacklog();
        this.fullJID = fullJID;
        return this;
    },
    
    /**
     * Samples the current state of the send buffer and generates a stanza
     * with an RTT element if there have been any changes since the last sample.
     * @param timestamp {Integer} is the time at which the sample is supposed
     *                   to take place - this can be less than the current time on
     *                   slow computers. This time is used as the reference for
     *                   the generation of <w> actions and bookkeeping for message
     *                   resets.
     * @param lastSampleTime {Integer} is the time at which the previous sample took
     *                   place. It is used as a reference similar to timestamp.
     * @param intervalLength {Integer} is the length of the sampling interval. It is
     *                   used as a reference for generating <w> actions.
     * @param resetDue {Boolean} is true if a message reset is due (as per the caller's
     *                   determination)
     * @returns {Node} the DOM node containing the stanza to send - or null if
     *             nothing to send.
     */
    sampleSendBuffer: function(timestamp, lastSampleTime, intervalLength, resetDue) {
        var message = null;
        var event = resetDue? 'reset' : null;
        var doSend = false;
        if (this.sendQueue.getActions().length > 0) {
            doSend = true;
            if (this.sendQueue.isNewMessage()) {
                // A new message since the last sample - need to create a new random
                // seq number.
                event = 'new';
                this.sendSequence = Math.floor(Math.random() * 0x3fffffff);
            }
        }
        else { 
            // no new actions since the last sample. Still need to check if there
            // needs to be a message reset. The criterion is:
            // 1. an action took place since the last reset AND
            // 2. this is not a new message - in case of a new message, we need to
            //    wait for action first
            doSend = (resetDue &&
                      ! this.sendQueue.isNewMessage() &&
                      this.sendQueue.getLastActionTimestamp() >= this.getLastSendReset());
        }
        if (doSend) {
            if (event === 'new' || event === 'reset')
                this.lastSendReset = timestamp;
            message = this._encodeRTT(event, this._getSendSeq(), timestamp, lastSampleTime, intervalLength);
            this.sendQueue.flush();
        }
        return message;
    },
    
    // Private function: decodes an event="new"
    _decodeNewMessage: function(seq, timestamp, rtt) {
        this.receiveSequence = seq;
        this.rttBuffer.newRTTMessage(timestamp);
        this._decodeRTT(rtt);
    },
    
    // Private function: decodes an event="reset"
    _decodeReset: function(seq, timestamp, rtt) {
        this.receiveSequence = seq;
        this.rttBuffer.reset(timestamp);
        this._decodeRTT(rtt);
    },
    
    // Private function: decodes an edit event
    // Triggers a sync loss if the expected sequene number does not match
    // what was received, or if the sender's full JID is different from the
    // previous one.
    _decodeEdit: function(fullJID, seq, rtt) {
        if (this.receiveSequence !== null) {
            this.receiveSequence++;
            this.receiveSequence &= _seqMask;
            if (this.receiveSequence === seq && this.fullJID === fullJID) {
                this._decodeRTT(rtt);
            }
            else {
                // This is an out-of sync RTT message
                this.receiveSequence = null;
                this.rttBuffer.syncLost();
                _warn("Lost rtt sync with %s", this.fullJID);
            }
        }
    },
    
    // Private function: decodes a message body
    _decodeBody: function(body) {
        this.receiveSequence = null;
        var message = Strophe.getText(body);
        this.rttBuffer.body(message);
    },
    
    // Private function: decodes all action elements in a <rtt> element
    _decodeRTT: function(rtt) {
        var that = this;
        Strophe.forEachChild(rtt, null, function(elem) {
            var pos = _undef;
            if (_hasAttribute(elem, "p"))
                pos = parseInt(elem.getAttribute("p"));
            var num = 1;
            if (_hasAttribute(elem, "n"))
                num = parseInt(elem.getAttribute("n"));
            if (Strophe.isTagEqual(elem, "t")) {
                var text = Strophe.getText(elem);
                that.rttBuffer.insert(pos, text);
            }
            else if (Strophe.isTagEqual(elem, "w")) {
                var delay = num;
                that.rttBuffer.wait(delay);
            }
            else if (Strophe.isTagEqual(elem, "e")) {
                var numChars = num;
                that.rttBuffer.erase(pos, numChars);
            }
        });
    },
    
    /** 
     * Private function: encodes all action elements in the send queue into
     * <message> + <rtt> element.
     * @param event {String} is the <rtt event="xxx"> if any, or null if none
     * @param seq {Integer} is the sequence number to send
     * @param timestamp {Integer} is the time at which the sample is supposed
     *                   to take place - this can be less than the current time on
     *                   slow computers. This time is used as the reference for
     *                   the generation of <w> actions and bookkeeping for message
     *                   resets.
     * @param lastSampleTime {Integer} is the time at which the previous sample took
     *                   place. It is used as a reference similar to timestamp.
     * @param intervalLength {Integer} is the length of the sampling interval. It is
     *                   used as a reference for generating <w> actions.
     * @returns {Node} the DOM node containing the stanza to send.
     */
    _encodeRTT: function(event, seq, timestamp, lastSampleTime, intervalLength) {
        var toJID = Strophe.getBareJidFromJid(this.fullJID);
        var message = $msg({
            to: toJID,
            type: "chat"
        });
        message = message.c("rtt", { xmlns: Strophe.NS.RTT, seq: seq });
        var actions = this.sendQueue.getActions();
        if (event !== null) {
            message = message.attrs({ event: event });
            _info("Generating rtt event: %s", event);
        }
        var preActionText = this.sendQueue.getPreQueueText();
        if ((event === 'new' || event === 'reset') &&
            preActionText.length > 0) {
            message = message.c('t').t(preActionText.toString()).up();
        }
        var lastTimestamp = lastSampleTime;
        for (var i = 0; i < actions.length; i++) {
            var a = actions[i];
            if (a.timestamp > lastTimestamp)
                message = message.c('w', { n: a.timestamp - lastTimestamp }).up();
            lastTimestamp = a.timestamp;
            if (a.action === ac.INSERT) {
                message = message.c('t');
                if (! _undefined(a.text))
                    message = message.t(a.text);
                if (! _undefined(a.pos))
                    message = message.attrs({ p: a.pos });
                message = message.up();
            }
            else if (a.action === ac.ERASE) {
                message = message.c('e');
                if (! _undefined(a.pos))
                    message = message.attrs({ p: a.pos });
                if (! _undefined(a.numChars))
                    message = message.attrs({ n: a.numChars });
                message = message.up();
            }
        }
        // Add final <w> element if the total time spent on the message is less than
        // the sample frequency
        var remainingTime = intervalLength - (lastTimestamp - lastSampleTime);
        if (actions.length > 0 && remainingTime > 0)
            message = message.c('w', { n: remainingTime }).up();
        return message.up();
    },
    
    // Private function: gets the sequence number to use, and increments it
    // for the next RTT stanza
    _getSendSeq: function() {
        this.sendSequence++;
        this.sendSequence &= _seqMask;
        return this.sendSequence;
    },
    
    // TODO: The intent is to periodically check for stale RTT messages. Not
    // a prority, and implementation can wait until later.
    drop: function(fullJID) {
        // TBD
    }
};

/**
 * Class to keep track of a set of RTT contexts, and to create new contexts automatically
 * when stanzas from a previously unseen JID arrive. The contexts are kept by
 * bare JID.
 */
/**
 * Constructor: creates a new set of RTT contexts
 * @param receiveEventHandler {Function} is the default event handler to assign
 *          to newly and automatically-created RTT contexts. See
 *          RTTContext.addReceiveEventListener() for the handler's signature. If
 *          undefined, no event handler is used.
 * @param senderReactivationListener {Function} is an event handler that is called
 *          when previously all RTT senders were inactive, and a sender is activated
 *          via the send queue activity event. It takes no arguments.
 */
Trophy.RTTContextManager = function(receiveEventHandler, senderReactivationListener) {
    this.contexts = {};
    this.activeSenders = {};
    this.numActiveSenders = 0;
    this.receiveEventHandler = !_undefined(receiveEventHandler)? receiveEventHandler : null;
    this.senderReactivationListener = !_undefined(senderReactivationListener)? senderReactivationListener : null;
};

Trophy.RTTContextManager.prototype = {
    /**
     * Sets a new default receive event handler. IMPORTANT: This change
     * does not apply retroactively to already existing contexts in this set.
     * @param handler {Function} is the default event handler to assign
     *      to newly and automatically-created RTT contexts. See
     *      RTTContext.addReceiveEventListener() for the handler's signature. If
     *      undefined, no event handler is used.
     */
    setDefaultReceiveEventHandler: function(handler) {
        this.receiveEventHandler = handler;
    },
    
    /**
     * Routes a message stanza to the appropriate context (which is kept by
     * bare JID). If the context does not yet exist, it is created automatically.
     * @param fullJID {String} is the full JID in the from attribute of the stanza
     * @param stanza {Node} is the DOM node representing the stanza
     */
    routeMessage: function(fullJID, stanza) {
        var jid = Strophe.getBareJidFromJid(fullJID);
        if (! this.contexts.hasOwnProperty(jid))
            this.contexts[jid] = this._newContext(fullJID);
        this.contexts[jid].decodeMessage(fullJID, stanza);
    },
    
    /**
     * Retrieves a context appropriate for the full JID (which is associated
     * with the corresponding bare JID. If it does not exist yet, it is
     * created automatically.
     * @param fullJID {String} is the full JID
     * @returns {Trophy.RTTContext} the context assigned to the corresponding bare JID
     */
    get: function(fullJID) {
        var jid = Strophe.getBareJidFromJid(fullJID);
        if (! this.contexts.hasOwnProperty(jid))
            this.contexts[jid] = this._newContext(fullJID);
        return this.contexts[jid];
    },
    
    /**
     * Gets an unordered list of all bare JIDs for which contexts exist in this
     * set.
     * @returns {Array} the list of all bare JIDs
     */
    getJIDList: function() {
        var users = [];
        for (var prop in this.contexts) {
            if (this.contexts.hasOwnProperty(prop))
                users.push(prop);
        }
        return users;
    },
    
    /**
     * Gets an unordered list of all bare JIDs for which active contexts exist in this
     * set.
     * @returns {Array} the list of all bare JIDs
     */
    getActiveSendersList: function() {
        var users = [];
        for (var prop in this.activeSenders) {
            if (this.activeSenders.hasOwnProperty(prop))
                users.push(prop);
        }
        return users;
    },
    
    /**
     * @returns {Integer}  the number of currently active senders
     */
    getNumActiveSenders: function() {
        return this.numActiveSenders;
    },
    
    /**
     * Marks a JID as inactive
     * @param jid {String} is the JID to deactivate
     */
    markInactive: function(jid) {
        if (this.activeSenders.hasOwnProperty(jid)) {
            delete this.activeSenders[jid];
            this.numActiveSenders--;
        }
    },
    
    // Private function: creates a new RTTContext and adds it to this set. 
    _newContext: function(fullJID) {
        var context = new Trophy.RTTContext(fullJID);
        if (this.receiveEventHandler !== null)
            context.addReceiveEventListener(this.receiveEventHandler);
        var bareJID = Strophe.getBareJidFromJid(fullJID);
        context.getSendQueue().addActivityListener(this._sendActivity.bind(this, bareJID));
        return context;
    },
    
    // Private function: called on sender activity event
    _sendActivity: function(jid) {
        var isReactivation = this.numActiveSenders  === 0;
        if (! this.activeSenders.hasOwnProperty(jid))
            this.numActiveSenders++;
        this.activeSenders[jid] = true;
        if (isReactivation && this.senderReactivationListener)
            this.senderReactivationListener();
    },
};

/**
 * Plugin providing RTT functionality for a Strophe connection
 */
/**
 * Constructor for RTTPlugin (this is used for unit testing only)
 * @param connection {Strophe.Connection} is the XMPP connection
 * @param defaultEventHandler {function} is the event handler for all RTT
 *           message activity. It receives parameters as follows:
 *              jid {String} - the bare JID of the sender
 *              event {Integer} - the event type as per Trophy.Events
 *              text {String} - the content of the RTT message
 *              context {RTTContext} - the RTTContext for which the event was triggered
 *           (see also RTTContext.addReceiveEventListener() for the signature)
 */
Trophy.RTTPlugin = function(connection, defaultReceiveEventHandler) {
    /**
     * XEP-0301 specification version
     */
    this.VERSION = "0.8";
    this.init(connection);
    this.setDefaultReceiveEventHandler(defaultReceiveEventHandler);

};

Trophy.RTTPlugin.prototype = {
    /**
     * Strophe.js plugin API: Initializes the plugin with a connection. The RTT
     * functionality then can be accessed as connection.rtt.
     * @param connection {Strophe.Connection} is the connection to piggyback on.
     */
    init: function(connection) {
        this.contexts = new Trophy.RTTContextManager(null, this._sendReactivationListener.bind(this));
        this.connection = connection;
        this.sampleTimer = null;
        this.sampleFrequency = 700;
        this.resetFrequency = 10000;
        this.lastSampleTime = null;
        this.isConnected = false;
        this.VERSION = "0.8";
        // If the disco Strophe plugin is installed, add the RTT namespace to the feature list
        if (connection.disco)
            connection.disco.addFeature(Strophe.NS.RTT);
    },

    /**
     * Sets a default event handler for receiving messages. It can be
     * accessed via connection.rtt.setDefaultReceiveEventHandler()
     * @param handler {function} is the event handler for all RTT
     *           message activity. It receives parameters as follows:
     *              jid {String} - the bare JID of the sender
     *              event {Integer} - the event type as per Trophy.Events
     *              text {String} - the content of the RTT message
     *              context {RTTContext} - the RTTContext for which the event was triggered
     *           (see also RTTContext.addReceiveEventListener() for the signature)
     * @returns {Trophy.RTTPlugin} this instance
     */
    setDefaultReceiveEventHandler: function(handler) {
        this.contexts.setDefaultReceiveEventHandler(handler);
        return this;
    },
    
    /**
     * Sets the interval in ms for consecutive RTT send queue samples.
     * The default is 700 ms.
     * It can be accessed as connection.rtt.setSampleFrequency()
     * @param frequency {Integer} is the interval in ms
     * @returns {Trophy.RTTPlugin} this instance
     */
    setSampleFrequency: function(frequency) {
        this.sampleFrequency = frequency;
        this._resetSampleTimer();
        return this;
    },
    
    /**
     * Sets the interval in ms for consecutive RTT reset events for the send queue.
     * The default is 10000 ms.
     * It can be accessed as connection.rtt.setResetFrequency().
     * @param frequency {Integer} is the interval in ms
     * @returns {Trophy.RTTPlugin} this instance
     */
    setResetFrequency: function(frequency) {
        this.resetFrequency = frequency;
        return this;
    },
    
    /**
     * Strophe.js Plugin API: Called when the status of the attached connection
     * changes. The main purpose is to attach the stanza handlers when the
     * connection comes online, and to initialize the sampling timer.
     * @param status {Integer} is the new status as per Strophe.Status.
     * @param condition {String} is an associated text message with more info
     */
    statusChanged: function(status, condition) {
        this.isConnected = (status === Strophe.Status.CONNECTED);
        _timedLog(_info, "Connection status change: %d - now %s", status, this.isConnected? "online" : "offline");
        if (this.isConnected) {
            if (! this.connection.disco) {
                this.discoHandler = this.connection.addHandler(
                        this._rttDisco.bind(this),
                        Strophe.NS.DISCO_INFO,
                        "iq", "get",
                        null, null, null
                        );
            }
            this.bodyHandler = this.connection.addHandler(
                    this._message.bind(this),
                    null,
                    "message", null,
                    null, null, null
                    );
            this._resetSampleTimer();
        }
    },
    
    /**
     * Returns the associated context manager
     * @returns {Trophy.RTTContextManager}
     */
    getContextManager: function() {
        return this.contexts;
    },

    /**
     * Main entry point for updating the RTT send queue with new text. The receiver
     * can be a bare or full JID, but the outgoing message is always addressed to
     * a bare JID.
     * @param jid {String} is the JID to which to send the RTT message
     * @param text {String} is the updated text. It completely replaces the
     *           previous contents of the RTT send queue - the implementation will
     *           generate the appropriate erase and insert actions based on the
     *           differences between the previous send queue contents and the new
     *           text. Updating the sent RTT is as simple as calling this
     *           function with the full text every time a keystroke or copy/paste
     *           is received. All edit events and wait actions will be generated
     *           automatically.
     * @returns {Trophy.RTTPlugin} this instance
     */
    rttUpdate: function(jid, text) {
        this.contexts.get(jid).getSendQueue().edit(text);
        return this;
    },

    /**
     * Main entry point for committing a message. It sends a body message and
     * clears the RTT send queue. Calling this function implies that any subsequent
     * RTT belongs to a new message. The receiver
     * can be a bare or full JID, but the outgoing message is always addressed to
     * a bare JID.
     * @param jid {String} is the JID to which to send the message
     * @param messageText {String} is the full message text
     * @returns {Trophy.RTTPlugin} this instance
     */
    sendBody: function(jid, messageText) {
        var toJID = Strophe.getBareJidFromJid(jid);
        var message = $msg({
            from: this.connection.jid,
            to: toJID,
            type: "chat",
            id: this.connection.getUniqueId()
        }).c("body", {}, messageText);
        var context = this.contexts.get(jid);
        context.getSendQueue().clear();
        _timedLog(_info, "Sending body message to %s", toJID);
        this.connection.send(message);
        return this;
    },
    
    // Private function: send back appropriate information about XEP-0301
    // support upon IQ discovery.
    // TODO: this may not really belong here. Reevaluate where this functionality
    // should be implemented. Perhaps in conjunction with an IQ Disco plugin for
    // Strophe.js?
    _rttDisco : function(stanza) {
        try {
            var from = stanza.getAttribute("from");
            _timedLog(_info, "Discovery query from %s", from);
            var iq = $iq({from: this.connection.jid, to: from, id: stanza.getAttribute("id"), type: "result"})
                        .c("query", {xmlns: Strophe.NS.DISCO_INFO})
                        .c("feature", {"var": Strophe.NS.RTT});
            this.connection.sendIQ(iq);
        }
        catch (e) {
            _error("Error in disco receive handler");
            if (e.stack) // Chrome
                _error(e.stack);
        }
        return true;
    },

    // Private function: main handler for receiving a stanza 
    _message : function(stanza) {
        try {
            var fullJID = stanza.getAttribute("from");
            _timedLog(_info, "Routing message from %s", fullJID);
            _debug(stanza);
            var type = stanza.getAttribute("type");
            if (type !== "error")
                this.contexts.routeMessage(fullJID, stanza);
            else
                _timedLog(_warn, "Received error stanza from %s", fullJID);
        }
        catch (e) {
            _error("Error in message receive handler");
            if (e.stack) // Chrome only
                _error(e.stack);
        }
        return true;
    },
    
    // Private function: is called when after inactivity, senders become active
    _sendReactivationListener: function() {
        // reset sample timer only if currently no timer is running.
        if (this.sampleTimer === null) {
            _timedLog(_info, "Resuming sample timer due to sender activity");
            this._resetSampleTimer();
        }
    },
    
    // Private function: reinitializes the sampling of the send queue
    _resetSampleTimer : function() {
        if (this.sampleTimer !== null) {
            this.connection.deleteTimedHandler(this.sampleTimer);
            this.sampleTimer = null;
        }
        if (this.isConnected && this.contexts.getNumActiveSenders() > 0) {
            this.lastSampleTime = new Date().getTime();
            this.sampleTimer = this.connection.addTimedHandler(this.sampleFrequency,
                        this._sampleAll.bind(this));
        }
    },
    
    // Private function: callback for initiating a sampling of all current RTT contexts
    _sampleAll: function() {
        try {
            var timestamp = new Date().getTime();
            _debug("Sampling send buffers");
            var users = this.contexts.getActiveSendersList();
            for (var i = 0; i < users.length; i++) {
                var jid = users[i];
                var context = this.contexts.get(jid);
                this._sampleContext(jid, context, timestamp);
            }
            this.lastSampleTime = timestamp;
        }
        catch (e) {
            _error("Error in sample all handler");
            if (e.stack) // Chrome
                _error(e.stack);
        }
        // Signal to Strophe.Connection that this handler should keep running
        return true;
    },
    
    // Private function: Initiates sampling of a single RTT context
    _sampleContext: function(jid, context, timestamp) {
        _debug("Sampling send buffer to jid: %s", jid);
        var lastReset = context.getLastSendReset();
        var resetDue = timestamp >= lastReset + this.resetFrequency - this.sampleFrequency / 2;
        var message = context.sampleSendBuffer(timestamp, this.lastSampleTime, this.sampleFrequency, resetDue);
        if (message !== null) {
            _timedLog(_info, "Sending rtt message to jid: %s", jid);
            message = message.attrs({ from: this.connection.jid, id: this.connection.getUniqueId() });
            this.connection.send(message);
        }
        else {
            // test if this context should be suspended, due to inactivity
            // (more than reset frequency)
            var lastActive = context.getSendQueue().getLastActionTimestamp();
            if (timestamp > lastActive + this.resetFrequency) {
                _timedLog(_info, "Marking context inactive: " + jid);
                this.contexts.markInactive(jid);
                if (this.contexts.getNumActiveSenders() == 0 && this.sampleTimer !== null) {
                    _timedLog(_info, "Suspending sampling due to no active senders");
                    this.connection.deleteTimedHandler(this.sampleTimer);
                    this.sampleTimer = null;
                }
            }
        }
    },
};

// Add the XEP-0301 namespace
Strophe.addNamespace("RTT", "urn:xmpp:rtt:0");
// Hook up the plugin into Strophe.js
Strophe.addConnectionPlugin("rtt", Trophy.RTTPlugin.prototype);

})();
