/*!
 * trophy-tests.js - unit tests for trophy.js
 * Copyright © 2013 Christian Vogler
 * 
 * Author: Christian Vogler <christian.vogler@gallaudet.edu>
 * Technology Access Program at Gallaudet University
 * http://tap.gallaudet.edu/
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

// Turn on logging

Trophy.log.setLogLevel(Trophy.log.DEBUG);

// helper functions and classes

function _attrsToDict(nodeAttrs) {
    var result = {};
    for (var i = 0; i < nodeAttrs.length; i++)
        result[nodeAttrs[i].name] = nodeAttrs[i].value;
    return result;
};

function _compareRTT(testMsg, refMsg, expectedSeq) {
    console.debug("test vs ref RTT comparison");
    console.debug(testMsg);
    console.debug(refMsg);
    refMsg = Trophy.parseXML(refMsg).childNodes[0];
    testMsg = Trophy.parseXML(testMsg).childNodes[0];
    ok(Strophe.isTagEqual(testMsg, refMsg.tagName), "same toplevel tag");
    deepEqual(_attrsToDict(testMsg.attributes), _attrsToDict(refMsg.attributes), "<message> attributes are the same");
    var refRTT = refMsg.getElementsByTagName("rtt")[0];
    var testRTT = testMsg.getElementsByTagName("rtt")[0];
    var seq = testRTT.getAttribute("seq");
    refRTT.setAttribute("seq", expectedSeq? expectedSeq : seq);
    deepEqual(_attrsToDict(testRTT.attributes), _attrsToDict(refRTT.attributes), "<rtt> attributes are the same");
    var refChildren = [];
    Strophe.forEachChild(refRTT, null, function(elem) { refChildren.push(elem); });
    var testChildren = [];
    Strophe.forEachChild(testRTT, null, function(elem) { testChildren.push(elem); });
    deepEqual(testChildren.length, refChildren.length, "same number of <rtt> child elements");
    for (var i = 0; i < testChildren.length; i++) {
        ok(Strophe.isTagEqual(testChildren[i], refChildren[i].tagName), "same action");
        if (Strophe.isTagEqual(testChildren[i], "w")) {
            var refDelay = parseInt(refChildren[i].getAttribute("n"));
            var testDelay = parseInt(testChildren[i].getAttribute("n"));
            _checkDelay(refDelay, testDelay);
            refChildren[i].setAttribute("n", testDelay.toString());
        }
        deepEqual(_attrsToDict(testChildren[i].attributes), _attrsToDict(refChildren[i].attributes), "action attributes are the same");
        if (Strophe.isTagEqual(testChildren[i], "t"))
            deepEqual(Strophe.getText(testChildren[i]), Strophe.getText(refChildren[i]), "text is the same");
    }
    return parseInt(seq);
};

var _undefined = function(arg) {
    return typeof arg === 'undefined';
};

function _checkTimes(expected) {
    var actual = new Date().getTime();
    var tolerance = 25;
    ok(actual >= expected - tolerance && actual <= expected + tolerance,
            "event happens at expected time: " + expected + " (now: " + actual
                    + ")");
};

function _checkDelay(expected, actual, tolerance, message) {
    if (_undefined(tolerance))
        tolerance = 35;
    if (_undefined(message))
        message = "";
    else
        message = message + ": ";
    ok(actual >= expected - tolerance && actual <= expected + tolerance,
            message + "delay is within expected time: " + expected + " (actual: " + actual
                    + ")");
};

_DummyConnection = function(sendCB) {
    this.handlers = [];
    this.sendCB = sendCB;
    this.nextId = 0;
    this.jid = "juliet@capulet.lit/balcony";
    this.timedHandler = null;
    
    for (var k in Strophe._connectionPlugins) {
        if (Strophe._connectionPlugins.hasOwnProperty(k)) {
        var ptype = Strophe._connectionPlugins[k];
            // jslint complaints about the below line, but this is fine
            var F = function () {};
            F.prototype = ptype;
            this[k] = new F();
        this[k].init(this);
        }
    }
};

_DummyConnection.prototype = {
    connect: function() {
        for (var k in Strophe._connectionPlugins) {
            if (Strophe._connectionPlugins.hasOwnProperty(k)) {
                var plugin = this[k];
                if (plugin.statusChanged) {
                    plugin.statusChanged(Strophe.Status.CONNECTED, "");
                }
            }
        }
    },
    
    disconnect: function() {
        for (var k in Strophe._connectionPlugins) {
            if (Strophe._connectionPlugins.hasOwnProperty(k)) {
                var plugin = this[k];
                if (plugin.statusChanged) {
                    plugin.statusChanged(Strophe.Status.DISCONNECTED, "");
                }
            }
        }
    },
        
    addHandler: function(a1, a2, a3, a4, a5, a6, a7) {
        this.handlers.push(new Strophe.Handler(a1, a2, a3, a4, a5, a6, a7));
    },

    receive: function(xml) {
        var tree = Trophy.parseXML(xml).childNodes[0];
        for (var i = 0; i < this.handlers.length; i++)
            if (this.handlers[i].isMatch(tree))
                this.handlers[i].run(tree);
    },
    
    sendIQ: function(elem) {
        this.sendCB(Strophe.serialize(elem));
    },
    
    send: function(elem) {
        this.sendCB(Strophe.serialize(elem));
    },
    
    getUniqueId: function() {
        return 't' + this.nextId++;
    },
    
    addTimedHandler: function(freq, handler) {
        this.deleteTimedHandler();
        this.timedHandler = setInterval(handler, freq);
        return this.timedHandler;
    },
    
    deleteTimedHandler: function(handler) {
        if (this.timedHandler !== null) {
            clearInterval(this.timedHandler);
            this.timedHandler = null;
        }
    }
};

// -----------------------------------

module("Trophy.WallClockEventQueue");
test("Trophy.WallClockEventQueue new", function() {
    var queue = new Trophy.WallClockEventQueue();
    ok(!queue.isRunning(), "Queue is not running after new");
    deepEqual(queue.length(), 0, "length is 0");
    ok(!queue.isRunning(), "Queue is not running after length()");
    deepEqual(queue.top(), null, "top element is null");
    ok(!queue.isRunning(), "Queue is not running after top()");
});

test("Trophy.WallClockEventQueue.enqueue", function() {
    var queue = new Trophy.WallClockEventQueue();
    var now = new Date().getTime();
    var fun = function() {
        ok(false, "We should never see this");
    };
    queue.enqueue(now + 4711, fun);
    ok(!queue.isRunning(), "Queue is not running after enqueue()");
    deepEqual(queue.length(), 1, "length is 1 after enqueue");
    ok(!queue.isRunning(), "Queue is not running after length()");
    deepEqual(queue.top(), {
        targetTime : 4711,
        callback : fun
    }, "top element has timecode now + 4711");
    ok(!queue.isRunning(), "Queue is not running after top()");
    queue.enqueue(now + 4712, fun).enqueue(now + 4712, fun);
    deepEqual(queue.length(), 3, "length is 3 after double enqueue");
    ok(!queue.isRunning(), "Queue is not running after double enqueue");
    deepEqual(queue.top(), {
        targetTime : 4711,
        callback : fun
    }, "top is still now + 4711 after double enqueue");
    ok(!queue.isRunning(), "Queue is not running after top()");
});

test("Trophy.WallClockEventQueue.dequeue", function() {
    var queue = new Trophy.WallClockEventQueue();
    var now = new Date().getTime();
    var fun = function() {
        ok(false, "We should never see this");
    };
    var fun2 = function() {
        ok(false, "We should never see this");
    };
    queue.enqueue(now + 4711, fun).enqueue(now + 4712, fun).enqueue(now + 4712,
            fun2);
    ok(!queue.isRunning(), "Queue is not running after triple enqueue()");
    deepEqual(queue.length(), 3, "length is 3 after triple enqueue");
    deepEqual(queue.top(), {
        targetTime : 4711,
        callback : fun
    }, "top element has timecode now + 4711");
    deepEqual(queue, queue.dequeue(), "dequeue() returns queue");
    ok(!queue.isRunning(), "Queue is not running after dequeue()");
    deepEqual(queue.length(), 2, "length is 2 after dequeue");
    deepEqual(queue.top(), {
        targetTime : 4712,
        callback : fun
    }, "top element has timecode now + 4712");
    queue.dequeue();
    ok(!queue.isRunning(), "Queue is not running after dequeue()");
    deepEqual(queue.length(), 1, "length is 1 after dequeue");
    deepEqual(queue.top(), {
        targetTime : 4712,
        callback : fun2
    }, "top element has timecode now + 4712");
    queue.dequeue();
    ok(!queue.isRunning(), "Queue is not running after dequeue()");
    deepEqual(queue.length(), 0, "length is 0 after dequeue");
    deepEqual(queue.top(), null, "top element is null");
    queue.dequeue();
    ok(!queue.isRunning(), "Queue is not running after dequeue()");
    deepEqual(queue.length(), 0, "length is 0 after idempotent dequeue");
    deepEqual(queue.top(), null, "top element is null");
    queue.enqueue(now + 4713, fun);
    ok(!queue.isRunning(), "Queue is not running after new enqueue()");
    deepEqual(queue.length(), 1, "length is 1 after new enqueue");
    deepEqual(queue.top(), {
        targetTime : 4713,
        callback : fun
    }, "top element has timecode now + 4713");
});

test("Trophy.WallClockEventQueue.enqueue invalid ordering", function() {
    var queue = new Trophy.WallClockEventQueue();
    var now = new Date().getTime();
    var fun = function() {
        ok(false, "We should never see this");
    };
    var prefix = 'Trophy.TimeOrderingViolation:';
    expect(12);
    try {
        queue.enqueue(now - 1, fun);
        ok(false, "The previous line should have thrown an exception");
    } catch (err) {
        deepEqual(err.substring(0, prefix.length),
                "Trophy.TimeOrderingViolation:",
                "Caught invalid timecode exception");
    }
    ok(!queue.isRunning(), "Queue is not running after enqueue() exception");
    deepEqual(queue.length(), 0, "length is 0 after enqueue() exception");
    try {
        queue.enqueue(now, fun);
        ok(true, "The previous line should not throw");
    } catch (err) {
        ok(false, "No exception should have been thrown");
    }
    ok(!queue.isRunning(), "Queue is not running after enqueue()");
    deepEqual(queue.length(), 1, "length is 1 after enqueue()");
    queue.enqueue(now + 4711, fun);
    try {
        queue.enqueue(now, fun);
        ok(false, "The previous line should have thrown");
    } catch (err) {
        deepEqual(err.substring(0, prefix.length),
                "Trophy.TimeOrderingViolation:",
                "Caught invalid timecode exception");
    }
    ok(!queue.isRunning(), "Queue is not running after enqueue() exception");
    deepEqual(queue.length(), 2, "length is 1 after enqueue() exception");
    queue.enqueue(now + 4712, fun);
    deepEqual(queue.length(), 3, "length is 2 after enqueue()");
    try {
        queue.enqueue(now + 4711, fun);
        ok(false, "The previous line should have thrown");
    } catch (err) {
        deepEqual(err.substring(0, prefix.length),
                "Trophy.TimeOrderingViolation:",
                "Caught invalid timecode exception");
    }
    deepEqual(queue.length(), 3, "length is 2 after enqueue() exception");
});

test("Trophy.WallClockEventQueue.clear", function() {
    var queue = new Trophy.WallClockEventQueue();
    var now = new Date().getTime();
    var fun = function() {
        ok(false, "We should never see this");
    };
    queue.enqueue(now + 4711, fun).enqueue(now + 5111, fun);
    deepEqual(queue.length(), 2, "length is 2 after enqueue");
    queue.clear();
    ok(!queue.isRunning(), "Queue is not running after clear()");
    deepEqual(queue.length(), 0, "length is 0");
    deepEqual(queue.top(), null, "top element is null");
});

test("Trophy.WallClockEventQueue.start", function() {
    var queue = new Trophy.WallClockEventQueue();
    ok(!queue.isRunning(), "Queue is not running after new");
    queue.start();
    ok(queue.isRunning(), "Queue is running after start");
    deepEqual(queue.length(), 0, "length is 0 after start");
});

test("Trophy.WallClockEventQueue.stop", function() {
    var queue = new Trophy.WallClockEventQueue();
    ok(!queue.isRunning(), "Queue is not running after new");
    queue.start();
    ok(queue.isRunning(), "Queue is running after start");
    deepEqual(queue.length(), 0, "length is 0 after start");
    queue.stop();
    ok(!queue.isRunning(), "Queue is no running after stop");
    deepEqual(queue.length(), 0, "length is 0 after stop");
});

asyncTest("Trophy.WallClockEventQueue event enqueue + start", function() {
    expect(5);
    var queue = new Trophy.WallClockEventQueue();
    var now = new Date().getTime();
    queue.enqueue(now + 10,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 10,
                        "target time is same as enqueued time");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 0, "Queue is empty after callback");
                ok(queue.isRunning(), "Queue is still running");
                start();
            });
    queue.start();
});

asyncTest("Trophy.WallClockEventQueue event start + enqueue", function() {
    expect(6);
    var queue = new Trophy.WallClockEventQueue();
    queue.start();
    ok(queue.isRunning(), "Queue is running");
    var now = new Date().getTime();
    queue.enqueue(now + 10,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 10,
                        "target time is same as enqueued time");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 0, "Queue is empty after callback");
                ok(queue.isRunning(), "Queue is still running");
                start();
            });
});

asyncTest("Trophy.WallClockEventQueue event multiple enqueue", function() {
    expect(10);
    var queue = new Trophy.WallClockEventQueue();
    var now = new Date().getTime();
    queue.enqueue(now + 10,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 10,
                        "target time is same as enqueued time");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 1,
                        "Queue is not empty after callback");
                ok(queue.isRunning(), "Queue is still running");
            });
    queue.enqueue(now + 100,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 100,
                        "target time is same as enqueued time");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 0, "Queue is empty after callback");
                ok(queue.isRunning(), "Queue is still running");
                start();
            });
    queue.start();
});

asyncTest("Trophy.WallClockEventQueue event multiple enqueue+more", function() {
    expect(10);
    var queue = new Trophy.WallClockEventQueue();
    var now = new Date().getTime();
    queue.enqueue(now + 10,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 10,
                        "target time is same as enqueued time");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(hasMore, "More elements pending in queue");
                deepEqual(queue.length(), 1,
                        "Queue is not empty after callback");
                ok(queue.isRunning(), "Queue is still running");
            });
    queue.enqueue(now + 11,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 11,
                        "target time is same as enqueued time");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 0, "Queue is empty after callback");
                ok(queue.isRunning(), "Queue is still running");
            });
    setTimeout(function() {
        queue.start();
        setTimeout(function() {
            start();
        }, 100);
    }, 15);
});

asyncTest(
        "Trophy.WallClockEventQueue event multiple enqueue+stop",
        function() {
            expect(6);
            var queue = new Trophy.WallClockEventQueue();
            var now = new Date().getTime();
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 1,
                        "Queue is not empty after callback");
                ok(queue.isRunning(), "Queue is still running");
                queue.stop();
                ok(!queue.isRunning(), "Queue is stopped");
            });
            queue
                    .enqueue(
                            now + 100,
                            function(targetTime, hasMore) {
                                ok(false,
                                        "We should never see this assertion, as queue should be stopped");
                            });
            queue.start();
            setTimeout(function() {
                ok(!queue.isRunning(),
                        "Queue is stopped after async callback completed");
                deepEqual(queue.length(), 1,
                        "Queue still has one element pending");
                start();
            }, 150);
        });

asyncTest("Trophy.WallClockEventQueue event multiple enqueue+stop+start",
        function() {
            expect(4);
            var queue = new Trophy.WallClockEventQueue();
            var now = new Date().getTime();
            var queueRestarted = false;
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(!hasMore, "No more elements pending in queue");
                queue.stop();
            });
            queue.enqueue(now + 100, function(targetTime, hasMore) {
                ok(queueRestarted, "Test if queue was restarted");
                start();
            });
            queue.start();
            setTimeout(function() {
                ok(!queue.isRunning(),
                        "Queue is stopped after async callback completed");
                deepEqual(queue.length(), 1,
                        "Queue still has one element pending");
                queueRestarted = true;
                queue.start();
            }, 150);
        });

asyncTest(
        "Trophy.WallClockEventQueue event multiple enqueue+more+stop in between",
        function() {
            expect(5);
            var queue = new Trophy.WallClockEventQueue();
            var now = new Date().getTime();
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(hasMore, "More elements pending in queue");
                queue.stop();
                ok(!queue.isRunning(), "Queue is stopped");
            });
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(!hasMore, "No more elements pending in queue");
                ok(!queue.isRunning(), "Queue is stopped");
            });
            queue
                    .enqueue(
                            now + 100,
                            function(targetTime, hasMore) {
                                ok(false,
                                        "We should never see this one, as queue was stopped");
                            });
            setTimeout(function() {
                queue.start();
                setTimeout(function() {
                    ok(!queue.isRunning(), "Queue is stopped in main");
                    start();
                }, 150);
            }, 15);
        });

asyncTest(
        "Trophy.WallClockEventQueue event multiple enqueue+more+clear in between",
        function() {
            expect(4);
            var queue = new Trophy.WallClockEventQueue();
            var now = new Date().getTime();
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(hasMore, "More elements pending in queue");
                deepEqual(queue.length(), 1, "Queue has one more element");
                queue.clear();
                deepEqual(queue.length(), 0, "Queue is empty");
                ok(queue.isRunning(), "Queue is still running");
            });
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(false, "We should never get here, as queue was cleared");
            });
            queue.start();
            setTimeout(function() {
                start();
            }, 50);
        });

asyncTest(
        "Trophy.WallClockEventQueue event multiple enqueue+more+clear+enqueue in between",
        function() {
            expect(7);
            var queue = new Trophy.WallClockEventQueue();
            var now = new Date().getTime();
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(hasMore, "More elements pending in queue");
                deepEqual(queue.length(), 1, "Queue has one more element");
                queue.clear();
                deepEqual(queue.length(), 0, "Queue is empty");
                ok(queue.isRunning(), "Queue is still running");
                queue.enqueue(now + 200, function(targetTime, hasMore) {
                    deepEqual(targetTime, now + 200,
                            "target time is same as enqueued time");
                    ok(new Date().getTime() >= now + 200,
                            "current time >= target time");
                    ok(!hasMore, "No more elements pending");
                    start();
                });
            });
            queue.enqueue(now + 10, function(targetTime, hasMore) {
                ok(false, "We should never get here, as queue was cleared");
            });
            queue.start();
        });

asyncTest("Trophy.WallClockEventQueue backlog", function() {
    expect(15);
    var queue = new Trophy.WallClockEventQueue();
    deepEqual(queue.backlog(), 0, "queue backlog is 0");
    var now = new Date().getTime();
    queue.enqueue(now + 10,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 10,
                        "target time is same as enqueued time");
                var newNow = new Date().getTime();
                deepEqual(queue.backlog(), now + 100 - newNow, "queue backlog is 90 ms from target time");
                ok(newNow >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 1,
                        "Queue is not empty after callback");
                ok(queue.isRunning(), "Queue is still running");
            });
    deepEqual(queue.backlog(), 10, "queue backlog is 10");
    queue.enqueue(now + 100,
            function(targetTime, hasMore) {
                deepEqual(targetTime, now + 100,
                        "target time is same as enqueued time");
                deepEqual(queue.backlog(), 0, "no more backlog in queue");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 0, "Queue is empty after callback");
                ok(queue.isRunning(), "Queue is still running");
                start();
            });
    deepEqual(queue.backlog(), 100, "queue backlog is 100");
    queue.start();
});

asyncTest("Trophy.WallClockEventQueue backlog reduce", function() {
    expect(29);
    var queue = new Trophy.WallClockEventQueue();
    deepEqual(queue.backlog(), 0, "queue backlog is 0");
    queue.reduceBacklog(200);
    deepEqual(queue.backlog(), 0, "queue backlog is 0 after reduce by 200");
    var now = new Date().getTime();
    queue.enqueue(now + 200,
            function(targetTime, hasMore) {
                _checkDelay(targetTime, now - 350, 3,
                        "target time is -350 ms past due to backlog reduction");
                var newNow = new Date().getTime();
                _checkDelay(queue.backlog(), now + 150 - newNow, 3, "queue backlog is 150 ms from target time");
                ok(new Date().getTime() >= targetTime,
                "   current time >= target time");
                ok(hasMore, "Has one more element pending in queue");
                deepEqual(queue.length(), 3,
                        "Queue is not empty after callback");
                ok(queue.isRunning(), "Queue is still running");
            });
    queue.enqueue(now + 300,
            function(targetTime, hasMore) {
                _checkDelay(targetTime, now - 250, 3,
                        "target time is -250 ms past due to backlog reduction");
                var newNow = new Date().getTime();
                _checkDelay(queue.backlog(), now + 150 - newNow, 3, "queue backlog is 150 ms from target time");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "Has no more elements pending in queue");
                deepEqual(queue.length(), 2,
                        "Queue is not empty after callback");
                ok(queue.isRunning(), "Queue is still running");
            });
    queue.enqueue(now + 600,
            function(targetTime, hasMore) {
                _checkDelay(targetTime, now + 50, 3,
                        "target time is 50 ms past due to backlog reduction");
                var newNow = new Date().getTime();
                _checkDelay(queue.backlog(), now + 150 - newNow, 3, "queue backlog is 100 ms from target time");
                ok(new Date().getTime() >= targetTime,
                    "current time >= target time");
                ok(!hasMore, "Has no more elements pending in queue");
                deepEqual(queue.length(), 1,
                        "Queue is not empty after callback");
                ok(queue.isRunning(), "Queue is still running");
            });
    queue.enqueue(now + 700,
            function(targetTime, hasMore) {
                _checkDelay(targetTime, now + 150, 3,
                        "target time is 100 ms past due to backlog reduction");
                deepEqual(queue.backlog(), 0, "no more backlog in queue");
                ok(new Date().getTime() >= targetTime,
                        "current time >= target time");
                ok(!hasMore, "No more elements pending in queue");
                deepEqual(queue.length(), 0, "Queue is empty after callback");
                ok(queue.isRunning(), "Queue is still running");
                start();
            });
    _checkDelay(queue.backlog(), 700, 3, "queue backlog is 700");
    queue.start();
    queue.reduceBacklog(1000);
    _checkDelay(queue.backlog(), 700, 3, "queue backlog is 700 after reduce 1000");
    queue.reduceBacklog(150);
    _checkDelay(queue.backlog(), 150, 3, "queue backlog is 150 after reduce 150");
});

// --------------------------------------

module("Trophy.UnicodeCharArray");
test("Trophy.UnicodeCharArray new", function() {
    var arr = new Trophy.UnicodeCharArray("");
    deepEqual(arr.length, 0, "length is 0");
    deepEqual(arr.toString(), "", "Empty string");
});

test("Trophy.UnicodeCharArray new with non-ascii string", function() {
    var arr = new Trophy.UnicodeCharArray("Hello Worldäöüßαβγό");
    deepEqual(arr.length, 19, "length is 19");
    deepEqual(arr.toString(), "Hello Worldäöüßαβγό", "Original string");
});

test(
        "Trophy.UnicodeCharArray new with string not in basic multilingual plane",
        function() {
            var arr = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
            deepEqual(arr.length, 16, "length is 16");
            deepEqual("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉".length, 26,
                    "Javascript string length is 26");
            deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉",
                    "Original string");
        });

test("Trophy.UnicodeCharArray new with char array", function() {
    var arr = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var carr = ["H", "e", "l", "l", "o", " ", "𝒥", "𝒶", "𝓋", "𝒶", "𝓈", "𝒸", "𝓇", "𝒾", "𝓅", "𝓉"];
    var ucarr = new Trophy.UnicodeCharArray(carr);
    deepEqual(arr.length, carr.length, "Strings are of same length");
    deepEqual(arr.toString(), ucarr.toString(), "strings are identical");
});

test(
        "Trophy.UnicodeCharArray new with broken surrograte pairs",
        function() {
            expect(2);
            try {
                var arr = new Trophy.UnicodeCharArray("A\uD87E");
                ok(false, "The previous line should throw");
            } catch (err) {
                deepEqual(
                        err,
                        "Unicode error: High surrogate without following low surrogate",
                        "Got exception 1");
            }
            try {
                var arr = new Trophy.UnicodeCharArray("A\uD87E" + "a");
                ok(false, "The previous line should throw");
            } catch (err) {
                deepEqual(
                        err,
                        "Unicode error: High surrogate without following low surrogate",
                        "Got exception 2");
            }
        });

test("Trophy.UnicodeCharArray insert", function() {
    var arr = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var retval = arr.insert(arr.length, '');
    deepEqual(retval, arr, "object identity after append");
    deepEqual(arr.length, 16, "length is 16");
    deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉",
            "string after noop append");
    arr.insert(arr.length, '!');
    deepEqual(arr.length, 17, "length is 17");
    deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!",
            "string after single char append");
    arr.insert(arr.length, '??');
    deepEqual(arr.length, 19, "length is 19");
    deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!??",
            "string after two char append");
    arr.insert(arr.length, ' 𝒶: a');
    deepEqual(arr.length, 24, "length is 24");
    deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after five char mixed append");

    arr.insert(0, '');
    deepEqual(arr.length, 24, "length is 24");
    deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after noop prepend");
    retval = arr.insert(0, "𝒶");
    deepEqual(retval, arr, "object identity after prepend");
    deepEqual(arr.length, 25, "length is 25");
    deepEqual(arr.toString(), "𝒶Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after one char prepend");
    arr.insert(0, "asdf");
    deepEqual(arr.length, 29, "length is 29");
    deepEqual(arr.toString(), "asdf𝒶Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after four char prepend");
    arr.insert(0, "𝒶a");
    deepEqual(arr.length, 31, "length is 31");
    deepEqual(arr.toString(), "𝒶aasdf𝒶Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after two char mixed prepend");

    arr.insert(2, "!");
    deepEqual(arr.length, 32, "length is 32");
    deepEqual(arr.toString(), "𝒶a!asdf𝒶Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after one char insertion");
    retval = arr.insert(15, "?*");
    deepEqual(retval, arr, "object identity after insert");
    deepEqual(arr.length, 34, "length is 34");
    deepEqual(arr.toString(),
            "𝒶a!asdf𝒶Hello 𝒥?*𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after two char insertion");
    arr.insert(8, " 𝒶𝓋𝒶 ");
    deepEqual(arr.length, 39, "length is 39");
    deepEqual(arr.toString(),
            "𝒶a!asdf𝒶 𝒶𝓋𝒶 Hello 𝒥?*𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!?? 𝒶: a",
            "string after mixed five char insertion");

    arr = new Trophy.UnicodeCharArray("");
    arr.insert(0, "asdf");
    deepEqual(arr.length, 4, "length is 4");
    deepEqual(arr.toString(), "asdf", "string after append to empty");
});

test("Trophy.UnicodeCharArray remove", function() {
    var arr = new Trophy.UnicodeCharArray(
            "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    arr.remove(arr.length - 1, 0);
    deepEqual(arr.length, 29, "length is 29 after noop remove");
    deepEqual(arr.toString(), "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉",
            "string after noop remove");
    arr.remove(0, 0);
    deepEqual(arr.length, 29, "length is 29 after noop remove");
    deepEqual(arr.toString(), "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉",
            "string after noop remove");
    var retval = arr.remove(10, 0);
    deepEqual(retval, arr, "object identity after remove");
    deepEqual(arr.length, 29, "length is 29 after noop remove",
            "string after noop remove");
    deepEqual(arr.toString(), "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");

    arr.remove(arr.length - 1, 1);
    deepEqual(arr.length, 28, "length is 28");
    deepEqual(arr.toString(), "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅",
            "string after one char remove");
    retval = arr.remove(0, 2);
    deepEqual(retval, arr, "object identity after append");
    deepEqual(arr.length, 26, "length is 26");
    deepEqual(arr.toString(), "llo this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅",
            "string after two char remove");
    arr.remove(10, 5);
    deepEqual(arr.length, 21, "length is 21");
    deepEqual(arr.toString(), "llo this ie 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅",
            "string after five char remove");
    arr.remove(0, arr.length);
    deepEqual(arr.length, 0, "length is 0");
    deepEqual(arr.toString(), "", "string after full remove");

    arr = new Trophy.UnicodeCharArray("");
    arr.remove(0, 0);
    deepEqual(arr.length, 0, "length is 0");
    deepEqual(arr.toString(), "", "string after remove from empty");
});

test("Trophy.UnicodeCharArray clear", function() {
    var arr = new Trophy.UnicodeCharArray(
            "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    deepEqual(arr.length, 29, "length is 29");
    deepEqual(arr.toString(), "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉",
            "original string");
    var retval = arr.clear();
    deepEqual(retval, arr, "object identity after clear");
    deepEqual(arr.length, 0, "length is 0");
    deepEqual(arr.toString(), "", "string after clear");
});

test("Trophy.UnicodeCharArray illegal subscripts", function() {
    var arr = new Trophy.UnicodeCharArray(
            "Hello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    deepEqual(arr.length, 29, "length is 29");
    arr.insert(-1, "asdf");
    deepEqual(arr.length, 33, "length is 33");
    deepEqual(arr.toString(), "asdfHello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉",
            "original string after illegal prepend");
    arr.insert(arr.length + 1, "asdf");
    deepEqual(arr.length, 37, "length is 37");
    deepEqual(arr.toString(),
            "asdfHello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉asdf",
            "original string after illegal append");
    arr.remove(-1, 3);
    deepEqual(arr.length, 34, "length is 34");
    deepEqual(arr.toString(), "fHello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉asdf",
            "original string after illegal append");
    arr.remove(arr.length, 1);
    deepEqual(arr.length, 33, "length is 33");
    deepEqual(arr.toString(), "fHello this is some 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉asd",
            "original string after illegal remove");
    arr.remove(10, 53);
    deepEqual(arr.length, 10, "length is 10");
    deepEqual(arr.toString(), "fHello thi",
            "original string after illegal remove");
    arr.remove(-10, 53);
    deepEqual(arr.length, 0, "length is 0");
    deepEqual(arr.toString(), "", "original string after illegal remove");
});

test("Trophy.UnicodeCharArray clone", function() {
    var arr = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var carr = arr.clone();
    arr.insert(arr.length, "!");
    deepEqual(arr.length, 17, "Original has length 17");
    deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!", "expect string: Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉!");
    deepEqual(carr.length, 16, "Clone has length 16");
    deepEqual(carr.toString(), "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉", "expect string: Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
});

test("Trophy.UnicodeCharArray substring", function() {
    var arr = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var sarr = arr.substring(6, 10);
    arr.insert(9, "!");
    deepEqual(arr.length, 17, "Original has length 17");
    deepEqual(arr.toString(), "Hello 𝒥𝒶𝓋!𝒶𝓈𝒸𝓇𝒾𝓅𝓉", "expect string: Hello 𝒥𝒶𝓋!𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    deepEqual(sarr.length, 4, "Substring has length 4");
    deepEqual(sarr.toString(), "𝒥𝒶𝓋𝒶", "expect string: 𝒥𝒶𝓋𝒶");
});

//--------------------------------------

module("Trophy.RTTBuffer");
test("Trophy.RTTBuffer new", function() {
    var buf = new Trophy.RTTBuffer();
    ok(!buf.isActive(), "RTT buffer is not active");
    deepEqual(buf.getText().toString(), "", "Buffer is empty");
});

test("Trophy.RTTBuffer start", function() {
    var buf = new Trophy.RTTBuffer();
    ok(!buf.isActive(), "RTT buffer is not active");
    deepEqual(buf.getText().toString(), "", "Buffer is empty");
    buf.newRTTMessage();
    ok(buf.isActive(), "RTT buffer is active");
    deepEqual(buf.getText().toString(), "", "Buffer is empty");
});

asyncTest("Trophy.RTTBuffer events", function() {
    expect(30);
    var buf = new Trophy.RTTBuffer();
    var seq = 0;
    ok(!buf.isActive(), "RTT buffer is not active");
    buf.addEventListener(function(event, rtt) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(rtt.toString(), "", "empty string");
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(rtt.toString(), "", "empty string");
            seq++;
            break;
        case 2:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.RESET, "rtt reset");
            deepEqual(rtt.toString(), "",
                    "expect empty string");
            seq++;
            break;
        case 3:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(rtt.toString(), "hello world!",
                    "expect string hello world!");
            seq++;
            break;
        case 4:
            QUnit.step(6);
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(rtt.toString(), "hello world!", "hello world!");
            seq++;
            break;
        case 5:
            QUnit.step(7);
            deepEqual(event, Trophy.Event.EDIT, "edit clear");
            deepEqual(rtt.toString(), "", "empty string");
            seq++;
            break;
        case 6:
            QUnit.step(8);
            deepEqual(event, Trophy.Event.STOP_RTT, "stop rtt");
            deepEqual(rtt.toString(), "", "empty string");
            seq++;
            break;
        case 7:
            QUnit.step(9);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(rtt.toString(), "", "empty string");
            seq++;
            break;
        case 8:
            QUnit.step(10);
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(rtt.toString(), "", "empty string");
            seq++;
            start();
            break;
        default:
            ok(false, "We should never fall through these cases");
        }
        ;
    });
    buf.newRTTMessage();
    QUnit.step(3);
    ok(buf.isActive(), "RTT buffer is active");
    buf.reset();
    buf.body('hello world!');
    buf.newRTTMessage();
    setTimeout(function() {
        buf.stopRTT();
        buf.newRTTMessage();
    }, 10);
});

asyncTest("Trophy.RTTBuffer edit events", function() {
    expect(32);
    var timebase = new Date().getTime();
    var buf = new Trophy.RTTBuffer(timebase);
    var seq = 0;
    buf.addEventListener(function(event, rtt) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "hx", "expect string: hx");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "hxw", "expect string: hxw");
            _checkTimes(timebase + 50);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "how", "expect string: how");
            _checkTimes(timebase + 80);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "how a", "expect string: how a");
            _checkTimes(timebase + 110);
            seq++;
            break;
        case 6:
            QUnit.step(7);
            deepEqual(event, Trophy.Event.RESET, "rtt reset");
            deepEqual(rtt.toString(), "how a",
                    "expect string: how a (reset doesn't change it)");
            _checkTimes(timebase + 120);
            seq++;
            break;
        case 7:
            QUnit.step(8);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "how are things?",
                    "expect string: how are things?");
            _checkTimes(timebase + 160);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        }
        ;
    });
    buf.newRTTMessage();
    buf.insert(0, 'hx');
    buf.wait(50);
    buf.insert(2, 'w');
    buf.wait(30);
    buf.erase(2, 1);
    buf.insert(1, 'o');
    buf.wait(30);
    buf.insert(3, ' at');
    buf.erase(6, 1);
    buf.wait(50);
    buf.insert(6, 're thi'); // this part should not be triggered due to the reset
    setTimeout(function() {
        buf.reset();
        buf.insert(0, "how are things?");
        setTimeout(function() {
            start();
        }, 80);
    }, timebase + 125 - new Date().getTime());
});

asyncTest("Trophy.RTTBuffer edit defaults", function() {
    expect(27);
    var timebase = new Date().getTime();
    var buf = new Trophy.RTTBuffer(timebase);
    var seq = 0;
    buf.addEventListener(function(event, rtt) {
        switch (seq) {
        case 0:
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "he", "expect string: he");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "he", "expect string: he");
            _checkTimes(timebase + 50);
            seq++;
            break;
        case 4:
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "hel", "expect string: hel");
            _checkTimes(timebase + 80);
            seq++;
            break;
        case 5:
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "h", "expect string: h");
            _checkTimes(timebase + 110);
            seq++;
            break;
        case 6:
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "how a", "expect string: how a");
            _checkTimes(timebase + 140);
            seq++;
            break;
        case 7:
            deepEqual(event, Trophy.Event.RESET, "rtt reset");
            deepEqual(rtt.toString(), "how a",
                    "expect string: how a (unchanged at this stage in reset)");
            _checkTimes(timebase + 150);
            seq++;
            break;
        case 8:
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "how are things?",
                    "expect string: how are things?");
            _checkTimes(timebase + 190);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        }
        ;
    });
    buf.newRTTMessage();
    var pos; // undefined
    var num; // undefined
    var text; // undefined
    buf.insert(pos, 'he');
    buf.wait(50);
    buf.insert(pos);
    buf.wait(30);
    buf.insert(pos, 'l');
    buf.wait(30);
    buf.erase(pos, 2);
    buf.wait(30);
    buf.insert(pos, 'ow at');
    buf.erase();
    buf.wait(50);
    buf.insert(6, 're thi'); // this part should not be triggered due to the reset
    setTimeout(function() {
        buf.reset();
        buf.insert(0, "how are things?");
        setTimeout(function() {
            start();
        }, 80);
    }, timebase + 155 - new Date().getTime());
});

_eventQueueClearTest = function(kind) {
    var timebase = new Date().getTime();
    var buf = new Trophy.RTTBuffer(timebase);
    var seq = 0;
    buf.addEventListener(function(event, rtt) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "hello", "expect string: hello");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(event, kind, "rtt reset/body/stop");
            if (kind == Trophy.Event.STOP_RTT) {
                deepEqual(rtt.toString(), "");
            } else if (kind == Trophy.Event.RESET) {
                deepEqual(rtt.toString(), "hello",
                        "expect string: hello (unchanged after reset)");
            } else {
                deepEqual(rtt.toString(), "hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉",
                        "expect string: hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
            }
            _checkTimes(timebase + 50);
            seq++;
            break;
        case 4:
            if (kind != Trophy.Event.RESET) 
                ok(false, "We should never fall through these cases");
            else {
                QUnit.step(5);
                deepEqual(rtt.toString(), "",
                    "expect empty string (after reset edit)");
                seq++;
            }
            break;
        default:
            ok(false, "We should never fall through these cases");
        }
        ;
    });
    buf.newRTTMessage();
    buf.insert(undefined, 'hello');
    buf.wait(100);
    buf.insert(undefined, ' world'); // this part should not be triggered due to the reset
    setTimeout(function() {
        if (kind == Trophy.Event.RESET)
            buf.reset();
        else if (kind == Trophy.Event.BODY)
            buf.body("hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
        else if (kind == Trophy.Event.STOP_RTT)
            buf.stopRTT();
        setTimeout(function() {
            start();
        }, 80);
    }, 50);
};

asyncTest("Trophy.RTTBuffer event queue clear on reset", function() {
    expect(18);
    _eventQueueClearTest(Trophy.Event.RESET);
});

asyncTest("Trophy.RTTBuffer event queue clear on body", function() {
    expect(16);
    _eventQueueClearTest(Trophy.Event.BODY);
});

asyncTest("Trophy.RTTBuffer event queue clear on rtt stop", function() {
    expect(16);
    _eventQueueClearTest(Trophy.Event.STOP_RTT);
});

asyncTest("Trophy.RTTBuffer sync loss event", function() {
    expect(20);
    var timebase = new Date().getTime();
    var buf = new Trophy.RTTBuffer(timebase);
    var seq = 0;
    buf.addEventListener(function(event, rtt) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(rtt.toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "hx", "expect string: hx");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(rtt.toString(), "hxw", "expect string: hxw");
            _checkTimes(timebase + 50);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.LOST_SYNC, "rtt sync lost");
            deepEqual(rtt.toString(), "hxw", "expect string: hxw");
            _checkTimes(timebase + 50);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    });
    buf.newRTTMessage();
    buf.insert(0, 'hx');
    buf.wait(50);
    buf.insert(2, 'w');
    buf.syncLost();
    setTimeout(function() {
        start();
    }, timebase + 100 - new Date().getTime());
});

//--------------------------------------

module("Trophy.RTTContext");

_rttNewStanza = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a01'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='0' event='new'>\
      <t>Hello, </t>\
    </rtt>\
    </message>\
";

_rttContinueStanza1 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a02'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1'>\
        <t>my </t>\
    </rtt>\
    </message>\
";

_rttContinueStanza1Edit = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a02'>\
    <rtt xmlns='urn:xmpp:rtt:0' event='edit' seq='1'>\
        <t>my </t>\
    </rtt>\
    </message>\
";

_rttContinueStanza2 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a03'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='2'>\
      <t>𝒥uliet!</t>\
    </rtt>\
    </message>\
";

_rttBodyStanza = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a04'>\
    <body>Hello, my 𝒥uliet!</body>\
    </message>\
";

asyncTest("trophy.RTTContext basic flow", function() {
    expect(30);
    var timebase = new Date().getTime();
    var ctx = new Trophy.RTTContext("romeo@montague.lit/orchard");
    var seq = 0;
    ctx.addReceiveEventListener(function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, ", "expect string: Hello, ");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my ", "expect string: Hello, my ");
            _checkTimes(timebase + 50);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase + 90);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase + 120);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    });
    ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewStanza).childNodes[0]);
    setTimeout(function() {
        ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttContinueStanza1).childNodes[0]);
        setTimeout(function() {
            ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttContinueStanza2).childNodes[0]);
            setTimeout(function() {
                ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttBodyStanza).childNodes[0]);
                setTimeout(function() {
                    start();
                }, 30);
            }, 30);
        }, 40);
    }, 50);
});

_rttNewStanza2 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a06'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1234' event='reset'>\
      <t>Hello, my 𝒥uliet!</t>\
    </rtt>\
    </message>\
";

_rttContinueStanza3 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a08'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1235'>\
      <t> </t>\
      <w n='50'/>\
      <t>Tx</t>\
      <e/>\
      <w n='30'/>\
      <t>his!</t>\
      <w n='40'/>\
      <e p='7' n='7'/>\
      <w n='30'/>\
      <t p='2'> dear</t>\
    </rtt>\
    </message>\
";

_rttContinueStanza3Edit = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a08'>\
    <rtt xmlns='urn:xmpp:rtt:0' event='edit' seq='1235'>\
      <t> </t>\
      <w n='50'/>\
      <t>Tx</t>\
      <e/>\
      <w n='30'/>\
      <t>his!</t>\
      <w n='40'/>\
      <e p='7' n='7'/>\
      <w n='30'/>\
      <t p='2'> dear</t>\
    </rtt>\
    </message>\
";

_rttContinueStanza4 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a108'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1235'>\
      <e p='7' n='7'/>\
      <t p='2'> dear</t>\
    </rtt>\
    </message>\
";

_rttNewBodyStanza = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a09'>\
    <body>my dear 𝒥uliet! This!</body>\
    </message>\
";

_rttNewBodyStanza2 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a09'>\
    <body>my dear 𝒥uliet!</body>\
    </message>\
";

asyncTest("trophy.RTTContext edit flow", function() {
    expect(36);
    var timebase = new Date().getTime();
    var ctx = new Trophy.RTTContext("romeo@montague.lit/orchard");
    var seq = 0;
    ctx.addReceiveEventListener(function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(text, "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.RESET, "reset");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet! ", "expect string: Hello, my 𝒥uliet! ");
            _checkTimes(timebase + 100);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet! T", "expect string: Hello, my 𝒥uliet! T");
            _checkTimes(timebase + 150);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet! This!", "expect string: Hello, my 𝒥uliet! This!");
            _checkTimes(timebase + 180);
            seq++;
            break;
        case 6:
            QUnit.step(7);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "my 𝒥uliet! This!", "expect string: my 𝒥uliet! This!");
            _checkTimes(timebase + 220);
            seq++;
            break;
        case 7:
            QUnit.step(8);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "my dear 𝒥uliet! This!", "expect string: my dear 𝒥uliet! This!");
            _checkTimes(timebase + 250);
            seq++;
            break;
        case 8:
            QUnit.step(9);
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(context.getRTTBuffer().getText().toString(), "my dear 𝒥uliet! This!", "expect string: my dear 𝒥uliet! This!");
            _checkTimes(timebase + 350);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    });
    ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewStanza2).childNodes[0]);
    setTimeout(function() {
        ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttContinueStanza3).childNodes[0]);
        setTimeout(function() {
            ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewBodyStanza).childNodes[0]);
            setTimeout(start, 50);
        }, 250);
    }, 100);
});

asyncTest("trophy.RTTContext edit event", function() {
    expect(36);
    var timebase = new Date().getTime();
    var ctx = new Trophy.RTTContext("romeo@montague.lit/orchard");
    var seq = 0;
    ctx.addReceiveEventListener(function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(text, "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.RESET, "reset");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet! ", "expect string: Hello, my 𝒥uliet! ");
            _checkTimes(timebase + 100);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet! T", "expect string: Hello, my 𝒥uliet! T");
            _checkTimes(timebase + 150);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet! This!", "expect string: Hello, my 𝒥uliet! This!");
            _checkTimes(timebase + 180);
            seq++;
            break;
        case 6:
            QUnit.step(7);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "my 𝒥uliet! This!", "expect string: my 𝒥uliet! This!");
            _checkTimes(timebase + 220);
            seq++;
            break;
        case 7:
            QUnit.step(8);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "my dear 𝒥uliet! This!", "expect string: my dear 𝒥uliet! This!");
            _checkTimes(timebase + 250);
            seq++;
            break;
        case 8:
            QUnit.step(9);
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(context.getRTTBuffer().getText().toString(), "my dear 𝒥uliet! This!", "expect string: my dear 𝒥uliet! This!");
            _checkTimes(timebase + 350);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    });
    ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewStanza2).childNodes[0]);
    setTimeout(function() {
        ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttContinueStanza3Edit).childNodes[0]);
        setTimeout(function() {
            ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewBodyStanza).childNodes[0]);
            setTimeout(start, 50);
        }, 250);
    }, 100);
});

asyncTest("trophy.RTTContext sync loss", function() {
    expect(32);
    var timebase = new Date().getTime();
    var ctx = new Trophy.RTTContext("romeo@montague.lit/orchard");
    var seq = 0;
    ctx.addReceiveEventListener(function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, ", "expect string: Hello, ");
            _checkTimes(timebase);
            seq++;
            break;
       case 3:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.LOST_SYNC, "rtt lost sync");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, ", "expect string: Hello, ");
            _checkTimes(timebase + 100);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.RESET, "rtt reset");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, ", "expect stringL Hello, (unchanged after reset)");
            _checkTimes(timebase + 150);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase + 150);
            seq++;
            break;
        case 6:
            QUnit.step(7);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "my dear 𝒥uliet!", "expect string: my dear 𝒥uliet!");
            _checkTimes(timebase + 220);
            seq++;
            break;
        case 7:
            QUnit.step(8);
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(context.getRTTBuffer().getText().toString(), "my dear 𝒥uliet!", "expect string: my dear 𝒥uliet!");
            _checkTimes(timebase + 350);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    });
    ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewStanza).childNodes[0]);
    setTimeout(function() {
        ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttContinueStanza2).childNodes[0]);
        setTimeout(function() {
            ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewStanza2).childNodes[0]);
            setTimeout(function() {
                ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttContinueStanza4).childNodes[0]);
                setTimeout(function() {
                    ctx.decodeMessage("romeo@montague.lit/orchard", Trophy.parseXML(_rttNewBodyStanza2).childNodes[0]);
                    setTimeout(start, 50);
                }, 130);
            }, 70);
        }, 50);
    }, 100);
});

// -----------------------
module("Trophy.RTTSendQueue");

test("Trophy.RTTSendQueue defaults", function() {
   var q = new Trophy.RTTSendQueue();
   deepEqual(q.getActions(), [], "no actions queued");
   deepEqual(q.getPreQueueText().toString(), "", "empty pre-action string");
   deepEqual(q.getPostQueueText().toString(), "", "empty post-action string");
   ok(q.isNewMessage(), "is a new message");
});

asyncTest("Trophy.RTTSendQueue actions", function() {
    expect(40);
    var q = new Trophy.RTTSendQueue();
    var timestamp = new Date().getTime();
    setTimeout(function() {
        q.insert(0, 'hx');
        ok(q.isNewMessage(), "is a new message");
        var a = q.getActions();
        deepEqual(a.length, 1, "only one element in queue");
        deepEqual(a[0], { action: Trophy.Action.INSERT, pos: undefined, text: 'hx', timestamp: a[0].timestamp }, "hx insert");
        deepEqual(q.getPreQueueText().toString(), "", "empty pre-action string");
        deepEqual(q.getPostQueueText().toString(), "hx", "post-action string: hx");
        _checkDelay(80, a[0].timestamp - timestamp);
        setTimeout(function() {
            q.insert(2, 'w');
            var a = q.getActions();
            ok(q.isNewMessage(), "is a new message");
            deepEqual(a.length, 2, "2 elements in queue");
            deepEqual(a[0], { action: Trophy.Action.INSERT, pos: undefined, text: 'hx', timestamp: a[0].timestamp }, "hx insert");
            _checkDelay(80, a[1].timestamp - a[0].timestamp);
            deepEqual(a[1], { action: Trophy.Action.INSERT, pos: undefined, text: 'w', timestamp: a[1].timestamp }, "w insert");           
            deepEqual(q.getPreQueueText().toString(), "", "empty pre-action string");
            deepEqual(q.getPostQueueText().toString(), "hxw", "post-action string: hxw");
            setTimeout(function() {
                q.erase(2, 1);
                q.insert(1, 'o');
                ok(q.isNewMessage(), "is a new message");
                var a = q.getActions();
                deepEqual(a.length, 4, "4 elements in queue");
                _checkDelay(50, a[2].timestamp - a[1].timestamp);
                deepEqual(a[2], { action: Trophy.Action.ERASE, pos: 2, numChars: undefined, timestamp: a[2].timestamp }, "x erase");           
                deepEqual(a[3], { action: Trophy.Action.INSERT, pos: 1, text: "o", timestamp: a[3].timestamp }, "o insert");           
                deepEqual(q.getPreQueueText().toString(), "", "empty pre-action string");
                deepEqual(q.getPostQueueText().toString(), "how", "post-action string: how");
                setTimeout(function() {
                    q.insert(3, ' at');
                    q.erase(6, 2);
                    ok(q.isNewMessage(), "is a new message");
                    var a = q.getActions();
                    deepEqual(a.length, 6, "6 elements in queue");
                    _checkDelay(120, a[4].timestamp - a[3].timestamp);
                    deepEqual(a[4], { action: Trophy.Action.INSERT, pos: undefined, text: ' at', timestamp: a[4].timestamp }, "at insert");           
                    deepEqual(a[5], { action: Trophy.Action.ERASE, pos: undefined, numChars: 2, timestamp: a[5].timestamp }, "at erase");           
                    deepEqual(q.getPreQueueText().toString(), "", "empty pre-action string");
                    deepEqual(q.getPostQueueText().toString(), "how ", "post-action string: how ");
                    setTimeout(function() {
                        q.flush();
                        ok(!q.isNewMessage(), "not a new message");
                        var a = q.getActions();
                        deepEqual(a.length, 0, "queue is empty");
                        deepEqual(q.getPreQueueText().toString(), "how ", "pre-action string: how ");
                        deepEqual(q.getPostQueueText().toString(), "how ", "post-action string: how ");
                        setTimeout(function() {
                            q.clear();
                            q.insert(0, "how are things?");
                            ok(q.isNewMessage(), "new message");
                            var a = q.getActions();
                            deepEqual(a.length, 1, "1 element in queue");
                            deepEqual(a[0], { action: Trophy.Action.INSERT, pos: undefined, text: 'how are things?', timestamp: a[0].timestamp }, "how are things? insert");           
                            deepEqual(q.getPreQueueText().toString(), "", "empty pre-action string");
                            deepEqual(q.getPostQueueText().toString(), "how are things?", "post-action string: how are things?");
                            q.flush();
                            ok(!q.isNewMessage(), "not a new message");
                            a = q.getActions();
                            deepEqual(a.length, 0, "queue is empty");
                            deepEqual(q.getPreQueueText().toString(), "how are things?", "pre-action string: how are things?");
                            deepEqual(q.getPostQueueText().toString(), "how are things?", "post-action string: how are things?");
                            start();
                        }, 100);
                    }, 80);
                }, 120);
            }, 50);
        }, 80);
    }, 80);
 });

asyncTest("Trophy.RTTSendQueue edit", function() {
    expect(11);
    var q = new Trophy.RTTSendQueue();
    var timestamp = new Date().getTime();
    q.insert(0, 'Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉');
    setTimeout(function() {
        q.edit("lo 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
        var a = q.getActions();
        deepEqual(a.length, 2, "two elements in queue");
        _checkDelay(80, a[1].timestamp - a[0].timestamp);
        deepEqual(a[1], { action: Trophy.Action.ERASE, pos: 3, numChars: 3, timestamp: a[1].timestamp }, "expect erase 3");
        q.edit("lo 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾");
        q.edit("lo 𝒶𝓋𝒶𝓈𝒸𝓇𝒾");
        q.edit("Hello 𝒶𝓋𝒶𝓈𝒸𝓇𝒾");
        q.edit("Hello 𝒶𝓋𝒶𝓈𝒸𝓇𝒾pt");
        q.edit("Hello J𝒶𝓋𝒶𝓈𝒸𝓇𝒾pt");
        q.edit("Hello 𝒥a𝓋𝒶𝓈𝒸𝓇𝒾pt");
        var a = q.getActions();
        deepEqual(a.length, 9, "nine elements in queue");
        deepEqual(a[2], { action: Trophy.Action.ERASE, pos: undefined, numChars: 2, timestamp: a[2].timestamp }, "expect erase 2");
        deepEqual(a[3], { action: Trophy.Action.ERASE, pos: 4, numChars: undefined, timestamp: a[3].timestamp }, "expect erase 1");
        deepEqual(a[4], { action: Trophy.Action.INSERT, pos: 0, text: "Hel", timestamp: a[4].timestamp }, "expect insert 3");
        deepEqual(a[5], { action: Trophy.Action.INSERT, pos: undefined, text: "pt", timestamp: a[5].timestamp }, "expect insert 2");
        deepEqual(a[6], { action: Trophy.Action.INSERT, pos: 6, text: "J", timestamp: a[6].timestamp }, "expect insert 1");
        deepEqual(a[7], { action: Trophy.Action.ERASE, pos: 8, numChars: 2, timestamp: a[7].timestamp }, "expect erase 2");
        deepEqual(a[8], { action: Trophy.Action.INSERT, pos: 6, text: "𝒥a", timestamp: a[8].timestamp }, "expect insert 2");
        start();
    }, 80);
 });

test("Trophy.RTTSendQueue action callbcks", function() {
    expect(46);
    var q = new Trophy.RTTSendQueue();
    var seq = 0;
    q.addActivityListener(function(queue) {
        ok(queue === q, "Queue object is passed back");
        seq++;
        if (seq < 8)
            QUnit.step(2 * seq);
        else
            QUnit.step(2 * 8 + (seq - 8));
    });
    deepEqual(seq, 0, "sequence starts at 0");
    QUnit.step(2 * seq + 1);
    q.insert(0, 'Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉');
    deepEqual(seq, 1, "sequence increase");
    QUnit.step(2 * seq + 1);
    q.edit("lo 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    deepEqual(seq, 2, "sequence increase");
    QUnit.step(2 * seq + 1);
    q.edit("lo 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾");
    deepEqual(seq, 3, "sequence increase");
    QUnit.step(2 * seq + 1);
    q.edit("lo 𝒶𝓋𝒶𝓈𝒸𝓇𝒾");
    deepEqual(seq, 4, "sequence increase");
    QUnit.step(2 * seq + 1);
    q.edit("Hello 𝒶𝓋𝒶𝓈𝒸𝓇𝒾");
    deepEqual(seq, 5, "sequence increase");
    QUnit.step(2 * seq + 1);
    q.edit("Hello 𝒶𝓋𝒶𝓈𝒸𝓇𝒾pt");
    deepEqual(seq, 6, "sequence increase");
    QUnit.step(2 * seq + 1);
    q.edit("Hello J𝒶𝓋𝒶𝓈𝒸𝓇𝒾pt");
    deepEqual(seq, 7, "sequence increase");
    QUnit.step(2 * seq + 1);
    q.edit("Hello 𝒥a𝓋𝒶𝓈𝒸𝓇𝒾pt");
    deepEqual(seq, 9, "sequence increase - insert and erase");
    QUnit.step(18);
    var a = q.getActions();
    deepEqual(a.length, 9, "nine elements in queue");
    deepEqual(a[0], { action: Trophy.Action.INSERT, pos: undefined, text: "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉", timestamp: a[0].timestamp }, "expect insert");
    deepEqual(a[1], { action: Trophy.Action.ERASE, pos: 3, numChars: 3, timestamp: a[1].timestamp }, "expect erase 3");
    deepEqual(a[2], { action: Trophy.Action.ERASE, pos: undefined, numChars: 2, timestamp: a[2].timestamp }, "expect erase 2");
    deepEqual(a[3], { action: Trophy.Action.ERASE, pos: 4, numChars: undefined, timestamp: a[3].timestamp }, "expect erase 1");
    deepEqual(a[4], { action: Trophy.Action.INSERT, pos: 0, text: "Hel", timestamp: a[4].timestamp }, "expect insert 3");
    deepEqual(a[5], { action: Trophy.Action.INSERT, pos: undefined, text: "pt", timestamp: a[5].timestamp }, "expect insert 2");
    deepEqual(a[6], { action: Trophy.Action.INSERT, pos: 6, text: "J", timestamp: a[6].timestamp }, "expect insert 1");
    deepEqual(a[7], { action: Trophy.Action.ERASE, pos: 8, numChars: 2, timestamp: a[7].timestamp }, "expect erase 2");
    deepEqual(a[8], { action: Trophy.Action.INSERT, pos: 6, text: "𝒥a", timestamp: a[8].timestamp }, "expect insert 2");
 });


// ----------------------------------
module("Trophy.stringDiff");

test("Trophy.stringDiff identity", function() {
    var s1 = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var s2 = s1.clone();
    deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: null }, "identical strings");
});

test("Trophy.stringDiff insertions", function() {
   var s1 = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
   var s2 = s1.clone();
   var len = s2.length;
   var us = Trophy.UnicodeCharArray;
   s2.insert(s2.length, "!");
   deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: [len, new us("!")]}, "Insert end !");
   s2 = s1.clone();
   s2.insert(s2.length, "𝓉t!");
   deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: [len, new us("𝓉t!")]}, "Insert end 𝓉t!");
   s2 = s1.clone();
   s2.insert(0, "H");
   deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: [1, new us("H")]}, "Insert start H (recognized as pos 1)");
   s2 = s1.clone();
   s2.insert(0, "Hex");
   deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: [2, new us("xHe")]}, "Insert start Hex (recognized as xHe at pos 2)");
   s2 = s1.clone();
   s2.insert(0, "There!");
   deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: [0, new us("There!")]}, "Insert start There!");
   s2 = s1.clone();
   s2.insert(5, " there,");
   deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: [6, new us("there, ")]}, "Insert start There!");
   s2 = s1.clone();
   s2.insert(0, "Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
   deepEqual(Trophy.stringDiff(s1, s2), { erase: null, insert: [len, new us("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉")]}, "Insert duplicate string");
   s2 = new Trophy.UnicodeCharArray("");
   deepEqual(Trophy.stringDiff(s2, s1), { erase: null, insert: [0, new us("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉")]}, "Insert into empty string");   
});

test("Trophy.stringDiff erases", function() {
    var s1 = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var s2 = s1.clone();
    var len = s2.length;
    s2.remove(s2.length - 1, 1);
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [len, 1], insert: null },  "Erase one at end");
    s2 = s1.clone();
    s2.remove(s2.length - 3, 3);
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [len, 3], insert: null }, "Erase three at end");
    s2 = s1.clone();
    s2.remove(0, 1);
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [1, 1], insert: null }, "Erase one at start");
    s2 = s1.clone();
    s2.remove(0, 3);
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [3, 3], insert: null }, "Erase three at start");
    s2 = s1.clone();
    s2.remove(5, 4);
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [9, 4], insert: null }, "Erase o 𝒥𝒶");
    s2 = s1.clone();
    s2.remove(2, 1);
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [4, 1], insert: null }, "Erase one l (recognized as erase from 4)");
    s2 = s1.clone();
    s2.remove(0, len);
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [len, len], insert: null }, "Erase all");
});

test("Trophy.stringDiff substitutions", function() {
    var s1 = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var s2 = s1.clone();
    var len = s2.length;
    var us = Trophy.UnicodeCharArray;
    s2.remove(s2.length - 1, 1);
    s2.insert(s2.length, 't');
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [len, 1], insert: [len - 1, new us('t')] },  "Substitute one at end");
    s2 = s1.clone();
    s2.remove(s2.length - 3, 3);
    s2.insert(s2.length, 'ipt');
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [len, 3], insert: [len - 3, new us('ipt')] }, "Substitute three at end");
    s2 = s1.clone();
    s2.remove(s2.length - 3, 3);
    s2.insert(s2.length, 'ipt!');
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [len, 3], insert: [len - 3, new us('ipt!')] }, "sub 3 with 4 at end");
    s2 = s1.clone();
    s2.remove(0, 1);
    s2.insert(0, 'h');
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [1, 1], insert: [0, new us('h')] }, "sub 1 at start");
    s2 = s1.clone();
    s2.remove(0, 3);
    s2.insert(0, 'Yxl');
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [2, 2], insert: [0, new us('Yx')] }, "sub 2 at start (l overlaps)");
    s2 = s1.clone();
    s2.remove(0, 3);
    s2.insert(0, 'Xowdy! ');
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [3, 3], insert: [0, new us('Xowdy! ')] }, "sub 3 with 7 at start");
    s2 = s1.clone();
    s2.remove(5, 4);
    s2.insert(5, 'Xowdy! ');
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [9, 4], insert: [5, new us('Xowdy! ')] }, "sub 4 with 5 in middle");
    s2 = new Trophy.UnicodeCharArray("To be or not to be is the question");
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [len, len], insert: [0, new us('To be or not to be is the question')] }, "sub all");
 });

test("Trophy.stringDiff multiple edits", function() {
    var s1 = new Trophy.UnicodeCharArray("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾𝓅𝓉");
    var s2 = s1.clone();
    var len = s2.length;
    var us = Trophy.UnicodeCharArray;
    s2.remove(12, 2);
    s2.insert(12, "ri");
    s2.remove(3, 2);
    s2.insert(3, "xyzzy");
    deepEqual(Trophy.stringDiff(s1, s2), { erase: [14, 11], insert: [3, new us('xyzzy 𝒥𝒶𝓋𝒶𝓈𝒸ri')] },  "multiple edits");
});

//---------------------------
module("Trophy.RTTPlugin");

asyncTest("trophy.RTTPlugin receive", function() {
    expect(30);
    var seq = 0;
    var timebase = new Date().getTime();
    var handler = function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, ", "expect string: Hello, ");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my ", "expect string: Hello, my ");
            _checkTimes(timebase + 50);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase + 90);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(text, "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase + 120);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    };
    var conn = new _DummyConnection();
    conn.rtt.setDefaultReceiveEventHandler(handler);
    conn.connect();
    conn.receive(_rttNewStanza);
    setTimeout(function() {
        conn.receive(_rttContinueStanza1);
        setTimeout(function() {
            conn.receive(_rttContinueStanza2);
            setTimeout(function() {
                conn.receive(_rttBodyStanza);
                setTimeout(function() {
                    conn.disconnect();
                    start();
                }, 30);
            }, 30);
        }, 40);
    }, 50);
});


_rttContinueStanza5 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a15'>\
    <rtt xmlns='urn:xmpp:rtt:0' event='edit' seq='1236'>\
      <w n='20'/>\
      <t> </t>\
      <w n='50'/>\
      <t>is!</t>\
    </rtt>\
    </message>\
";

_rttBodyStanza5 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a16'>\
    <body>my dear 𝒥uliet! This! is!</body>\
    </message>\
";

_rttNewStanza5 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a06'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1234' event='reset'>\
      <t>Hello</t>\
      <w n='40'/>\
      <t> there!</t>\
    </rtt>\
    </message>\
";

asyncTest("trophy.RTTPlugin receive pileup", function() {
    expect(51);
    var timebase = new Date().getTime();
    var seq = 0;
    var handler = function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(text, "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.RESET, "reset");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet! ", "expect string: Hello, my 𝒥uliet! ");
            _checkTimes(timebase + 100);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet! T", "expect string: Hello, my 𝒥uliet! T");
            _checkTimes(timebase + 150);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet! This!", "expect string: Hello, my 𝒥uliet! This!");
            _checkTimes(timebase + 180);
            seq++;
            break;
        case 6:
            QUnit.step(7);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "my 𝒥uliet! This!", "expect string: my 𝒥uliet! This!");
            _checkTimes(timebase + 220);
            seq++;
            break;
        case 7:
            QUnit.step(8);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "my dear 𝒥uliet! This!", "expect string: my dear 𝒥uliet! This!");
            _checkTimes(timebase + 250);
            seq++;
            break;
        case 8:
            QUnit.step(9);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "my dear 𝒥uliet! This! ", "expect string: my dear 𝒥uliet! This! ");
            _checkTimes(timebase + 270);
            seq++;
            break;
        case 9:
            QUnit.step(10);
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(text, "my dear 𝒥uliet! This! is!", "expect string: my dear 𝒥uliet! This! is!");
            _checkTimes(timebase + 320);
            seq++;
            break;
        case 10:
            QUnit.step(11);
            deepEqual(event, Trophy.Event.RESET, "reset");
            _checkTimes(timebase + 370);
            seq++;
            break;
        case 11:
            QUnit.step(12);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello", "expect string: Hello");
            _checkTimes(timebase + 370);
            seq++;
            break;
        case 12:
            QUnit.step(13);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello there!", "expect string: Hello, there!");
            _checkTimes(timebase + 410);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    };
    var conn = new _DummyConnection();
    conn.rtt.setDefaultReceiveEventHandler(handler);
    conn.connect();
    conn.receive(_rttNewStanza2);
    setTimeout(function() {
        conn.receive(_rttContinueStanza3);
        setTimeout(function() {
            conn.receive(_rttContinueStanza5);
            setTimeout(function() {
                conn.receive(_rttBodyStanza5);
                setTimeout(function() {
                    conn.receive(_rttNewStanza5);
                    setTimeout(function() {
                        conn.disconnect();
                        start();
                    }, 200);
                }, 50)
            }, 50);
        }, 150);
    }, 100);
});

_rttContinueStanza6 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a08'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1235'>\
      <t> </t>\
      <w n='50'/>\
      <t>Tx</t>\
      <e/>\
      <w n='30'/>\
      <t>his!</t>\
      <w n='40'/>\
      <e p='7' n='7'/>\
      <w n='30'/>\
      <t p='2'> dear</t>\
      <w n='550'/>\
    </rtt>\
    </message>\
";

_rttContinueStanza7 = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='chat' id='a09'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1236'>\
      <t> </t>\
      <w n='250'/>\
      <t>it</t>\
      <e/>\
      <w n='300'/>\
      <t>s!</t>\
    </rtt>\
    </message>\
";

asyncTest("trophy.RTTPlugin receive backlog", function() {
    expect(28);
    var timebase = new Date().getTime();
    var seq = 0;
    var handler = function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(text, "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(event, Trophy.Event.RESET, "reset");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            // the backlog at this point is being reduced, so the next few edits in the RTT message
            // are combined into one
            deepEqual(text, "my dear 𝒥uliet! This!", "expect string: my dear 𝒥uliet! This!");
            _checkTimes(timebase + 100);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "my dear 𝒥uliet! This! ", "expect string: my dear 𝒥uliet! This! ");
            // Normally, this would be 800, but the backlog monitoring should reduce it
            // by 250
            _checkTimes(timebase + 800 - 250);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "my dear 𝒥uliet! This! i", "expect string: my dear 𝒥uliet! This! i");
            // Normally, this would be 1050, but the backlog monitoring should reduce it
            _checkTimes(timebase + 1050 - 250);
            seq++;
            break;
        case 6:
            QUnit.step(7);
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "my dear 𝒥uliet! This! is!", "expect string: my dear 𝒥uliet! This! is!");
            // Normally, this would be 1350, but the backlog monitoring should reduce it
            _checkTimes(timebase + 1350 - 250);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    };
    var conn = new _DummyConnection();
    conn.rtt.setDefaultReceiveEventHandler(handler);
    conn.connect();
    conn.receive(_rttNewStanza2);
    setTimeout(function() {
        conn.receive(_rttContinueStanza6);
        conn.receive(_rttContinueStanza7);
        setTimeout(function() {
            conn.disconnect();
            start();
        }, 1180);
    }, 100);
});

asyncTest("trophy.RTTPlugin receive edit", function() {
    expect(30);
    var seq = 0;
    var timebase = new Date().getTime();
    var handler = function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, ", "expect string: Hello, ");
            _checkTimes(timebase);
            seq++;
            break;
        case 3:
            QUnit.step(4);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my ", "expect string: Hello, my ");
            _checkTimes(timebase + 50);
            seq++;
            break;
        case 4:
            QUnit.step(5);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(context.getRTTBuffer().getText().toString(), "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase + 90);
            seq++;
            break;
        case 5:
            QUnit.step(6);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.BODY, "rtt body");
            deepEqual(text, "Hello, my 𝒥uliet!", "expect string: Hello, my 𝒥uliet!");
            _checkTimes(timebase + 120);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    };
    var conn = new _DummyConnection();
    conn.rtt.setDefaultReceiveEventHandler(handler);
    conn.connect();
    conn.receive(_rttNewStanza);
    setTimeout(function() {
        conn.receive(_rttContinueStanza1Edit);
        setTimeout(function() {
            conn.receive(_rttContinueStanza2);
            setTimeout(function() {
                conn.receive(_rttBodyStanza);
                setTimeout(function() {
                    conn.disconnect();
                    start();
                }, 30);
            }, 30);
        }, 40);
    }, 50);
});

_rttContinueStanza1Error = "\
    <message to='juliet@capulet.lit' from='romeo@montague.lit/orchard' type='error' id='a02'>\
    <rtt xmlns='urn:xmpp:rtt:0' seq='1'>\
        <t>my </t>\
    </rtt>\
    </message>\
";
asyncTest("trophy.RTTPlugin receive error", function() {
    expect(15);
    var seq = 0;
    var timebase = new Date().getTime();
    var handler = function(jid, event, text, context) {
        switch (seq) {
        case 0:
            QUnit.step(1);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.START_RTT, "start rtt");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 1:
            QUnit.step(2);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.NEW_MESSAGE, "new message");
            deepEqual(context.getRTTBuffer().getText().toString(), "", "empty string");
            _checkTimes(timebase);
            seq++;
            break;
        case 2:
            QUnit.step(3);
            deepEqual(jid, "romeo@montague.lit");
            deepEqual(event, Trophy.Event.EDIT, "rtt edit");
            deepEqual(text, "Hello, ", "expect string: Hello, ");
            _checkTimes(timebase);
            seq++;
            break;
        default:
            ok(false, "We should never fall through these cases");
        };
    };
    var conn = new _DummyConnection();
    conn.rtt.setDefaultReceiveEventHandler(handler);
    conn.connect();
    conn.receive(_rttNewStanza);
    setTimeout(function() {
        conn.receive(_rttContinueStanza1Error);
        setTimeout(function() {
            conn.disconnect();
            start();
        }, 30);
    }, 50);
});

_iqStanza = "\
    <iq from='romeo@montague.lit/orchard'\
        id='disco1'\
        to='juliet@capulet.lit/balcony'\
        type='get'>\
      <query xmlns='http://jabber.org/protocol/disco#info'/>\
    </iq>\
";

test("Trophy.RTTPlugin IQ response", function() {
    expect(1);
    var conn = new _DummyConnection(function(text) {
        deepEqual(text, "<iq from='juliet@capulet.lit/balcony' to='romeo@montague.lit/orchard' id='disco1' type='result' xmlns='jabber:client'><query xmlns='http://jabber.org/protocol/disco#info'><feature var='urn:xmpp:rtt:0'/></query></iq>");
    });
    conn.connect();
    conn.receive(_iqStanza);
    conn.disconnect();
});

_sendMsg1 = "\
<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' id='t0' type='chat' xmlns='jabber:client'>\
  <rtt xmlns='urn:xmpp:rtt:0' event='new'>\
    <t>He</t>\
    <w n='100'/>\
    <t>l</t>\
    <w n='100'/>\
  </rtt>\
</message>"; // 16

_sendMsg2 = "\
<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' id='t1' type='chat' xmlns='jabber:client'>\
  <rtt xmlns='urn:xmpp:rtt:0'>\
    <w n='50'/>\
    <t>lo 𝒥</t>\
    <w n='70'/>\
    <t>𝒶𝓋𝒶x</t>\
    <w n='40'/>\
    <e/>\
    <t>𝓈</t>\
    <w n='40'/>\
  </rtt>\
</message>"; // 27

_sendMsg3 = "\
<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' id='t2' type='chat' xmlns='jabber:client'>\
  <rtt xmlns='urn:xmpp:rtt:0' event='reset'>\
    <t>Hello 𝒥𝒶𝓋𝒶𝓈</t>\
    <w n='50'/>\
    <t>𝒸</t>\
    <w n='150'/>\
  </rtt>\
</message>"; // 16

_sendMsg4 = "\
<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' id='t3' type='chat' xmlns='jabber:client'>\
  <rtt xmlns='urn:xmpp:rtt:0'>\
    <w n='80'/>\
    <t>𝓇𝒾pt</t>\
    <w n='120'/>\
  </rtt>\
</message>"; // 13

_sendMsg5 = "\
<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' id='t4' type='chat' xmlns='jabber:client'>\
  <rtt xmlns='urn:xmpp:rtt:0' event='new'>\
    <t>Hi!</t>\
    <w n='200'/>\
  </rtt>\
</message>"; // 10

_sendMsg6 = "\
<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' id='t5' type='chat' xmlns='jabber:client'>\
  <rtt xmlns='urn:xmpp:rtt:0'>\
    <w n='50'/>\
    <t> H</t>\
    <w n='150'/>\
  </rtt>\
</message>"; // 13

_sendMsg7 = "\
<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' id='t6' type='chat' xmlns='jabber:client'>\
  <rtt xmlns='urn:xmpp:rtt:0' event='reset'>\
    <t>Hi! H</t>\
  </rtt>\
</message>"; // 7

asyncTest("Trophy.RTTPlugin RTT send", function() {
    expect(102);
    var seq = 0;
    var rttSeq = null;
    var conn = new _DummyConnection(function(stanza) {
        switch (seq) {
        case 0:
            rttSeq = _compareRTT(stanza, _sendMsg1, null);
            seq++;
            break;
        case 1:
            rttSeq = _compareRTT(stanza, _sendMsg2, rttSeq + 1);
            seq++;
            break;
        case 2:
            rttSeq = _compareRTT(stanza, _sendMsg3, rttSeq + 1);
            seq++;
            break;
        case 3:
            rttSeq = _compareRTT(stanza, _sendMsg4, rttSeq + 1);
            seq++;
            break;
        case 4:
            rttSeq = _compareRTT(stanza, _sendMsg5, null);
            seq++;
            break;
        case 5:
            rttSeq = _compareRTT(stanza, _sendMsg6, rttSeq + 1);
            seq++;
            break;
        case 6:
            rttSeq = _compareRTT(stanza, _sendMsg7, rttSeq + 1);
            seq++;
            break;
        default:
            ok(false, "We should never get here");
        };
    });
    conn.rtt.setSampleFrequency(200).setResetFrequency(550);
    conn.connect();
    var ctx = conn.rtt.getContextManager().get("romeo@montague.lit");
    var q = ctx.getSendQueue();
    setTimeout(function() {
    q.edit('He');
    setTimeout(function() {
        // 100
        q.edit('Hel');
        setTimeout(function() {
            // 250; case 0 happened
            q.edit('Hello 𝒥');
            setTimeout(function() {
                // 320
                conn.rtt.rttUpdate("romeo@montague.lit", "Hello 𝒥𝒶𝓋𝒶x");
                setTimeout(function() {
                    // 360
                    q.edit("Hello 𝒥𝒶𝓋𝒶𝓈"); 
                    setTimeout(function() {
                        // 650; case 1 happened
                        q.edit("Hello 𝒥𝒶𝓋𝒶𝓈𝒸");
                        setTimeout(function() {
                           // 880 // case 2 happened; reset at 800 (>200 + 550 = 700)
                           q.edit("Hello 𝒥𝒶𝓋𝒶𝓈𝒸𝓇𝒾pt");
                           setTimeout(function() {
                               // 1050 // case 3 happened
                               q.clear();
                               setTimeout(function() {
                                   // 1650 ; reset check at 1600
                                   q.edit("Hi!");
                                   setTimeout(function() {
                                       // 1900; case 4 happened
                                       q.edit("Hi! H");
                                       setTimeout(function() {
                                           // 2850; case 5, 6 happened
                                           conn.disconnect();
                                           start();
                                       }, 950);
                                   }, 250);
                               }, 600);
                           }, 170);
                        }, 230);
                    }, 290);
                }, 40);
            }, 70);
        }, 150);
    }, 100);
    }, 3);
});

_sendBody1 = "<message from='juliet@capulet.lit/balcony' to='romeo@montague.lit' type='chat' id='t1' xmlns='jabber:client'>" +
		"<body>Hello world!</body></message>";

asyncTest("Trophy.RTTPlugin RTT sendBody", function() {
    expect(17);
    var seq = 0;
    var conn = new _DummyConnection(function(stanza) {
        switch (seq) {
        case 0:
            _compareRTT(stanza, _sendMsg1, null);
            seq++;
            break;
        case 1:
            deepEqual(stanza, _sendBody1, "body matches");
            seq++;
            break;
        default:
            ok(false, "We should never get here");
        };
    });
    conn.rtt.setSampleFrequency(200).setResetFrequency(550);
    conn.connect();
    var bridge = conn.rtt;
    setTimeout(function() {
    bridge.rttUpdate('romeo@montague.lit/orchard', 'He');
    setTimeout(function() {
        // 100
        bridge.rttUpdate('romeo@montague.lit/orchard', 'Hel');
        setTimeout(function() {
            // 250; case 0 happened
            bridge.rttUpdate('romeo@montague.lit/orchard', 'Hello wo');
            setTimeout(function() {
                // 320
                bridge.sendBody("romeo@montague.lit/orchard", "Hello world!");
                // case 1 happened
                setTimeout(function() {
                    // 1000 - no further events
                    conn.disconnect();
                    start();
                }, 680);
            }, 70);
        }, 150);
    }, 100);
    }, 3);
});
