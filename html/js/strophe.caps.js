/**
 * Entity Capabilities (XEP-0115)
 *
 * Depends on disco plugin.
 *
 * See: http://xmpp.org/extensions/xep-0115.html
 *
 * Authors:
 *   - Michael Weibel <michael.weibel@gmail.com>
 *
 * Copyright:
 *   - Michael Weibel <michael.weibel@gmail.com>
 */

 Strophe.addConnectionPlugin('caps', {
	/** Constant: HASH
	 * Hash used
	 *
	 * Currently only sha-1 is supported.
	 */
	HASH: 'sha-1',
	/** Variable: node
	 * Client which is being used.
	 *
	 * Can be overwritten as soon as Strophe has been initialized.
	 */
	node: 'http://strophe.im/strophejs/',
	/** PrivateVariable: _ver
	 * Own generated version string
	 */
	_ver: '',
	/** PrivateVariable: _connection
	 * Strophe connection
	 */
	_connection: null,
	/** PrivateVariable: _knownCapabilities
	 * A hashtable containing version-strings and their capabilities, serialized
	 * as string.
	 *
	 * TODO: Maybe those caps shouldn't be serialized.
	 */
	_knownCapabilities: {},
	/** PrivateVariable: _jidVerIndex
	 * A hashtable containing jids and their versions for better lookup of capabilities.
	 */
	_jidVerIndex: {},

	/** Function: init
	 * Initialize plugin:
	 *   - Add caps namespace
	 *   - Add caps feature to disco plugin
	 *   - Add handler for caps stanzas
	 *
	 * Parameters:
	 *   (Strophe.Connection) conn - Strophe connection
	 */
	init: function(conn) {
	    this._changeListeners = [];
		this._connection = conn;

		Strophe.addNamespace('CAPS', 'http://jabber.org/protocol/caps');

		if (!this._connection.disco) {
			throw "Caps plugin requires the disco plugin to be installed.";
		}

		this._connection.disco.addFeature(Strophe.NS.CAPS);
	},

	addChangeListener: function(listener) {
	    this._changeListeners.push(listener);
	},
	
	statusChanged: function(status, condition) {
        if (status == Strophe.Status.ATTACHED || status == Strophe.Status.CONNECTED)
        {
            try
            {
                this._connection.addHandler(this._delegateCapabilities.bind(this), Strophe.NS.CAPS);
            }
            catch (e)
            {
                Strophe.error(e);
            }
        }	    
	},
	
	/** Function: generateCapsAttrs
	 * Returns the attributes for generating the "c"-stanza containing the own version
	 *
	 * Returns:
	 *   (Object) - attributes
	 */
	generateCapsAttrs: function() {
		return {
			'xmlns': Strophe.NS.CAPS,
			'hash': this.HASH,
			'node': this.node,
			'ver': this.generateVer()
		};
	},

	/** Function: generateVer
	 * Returns the base64 encoded version string (encoded itself with sha1)
	 *
	 * Returns:
	 *   (String) - version
	 */
	generateVer: function() {
		if (this._ver !== "") {
			return this._ver;
		}

		var ver = "",
			identities = this._connection.disco._identities.sort(this._sortIdentities),
			identitiesLen = identities.length,
			features = this._connection.disco._features.sort(),
			featuresLen = features.length;
		for(var i = 0; i < identitiesLen; i++) {
			var curIdent = identities[i];
			ver += curIdent.category + "/" + curIdent.type + "/" + curIdent.lang + "/" + curIdent.name + "<";
		}
		for(var i = 0; i < featuresLen; i++) {
			ver += features[i] + '<';
		}

		this._ver = b64_sha1(ver);
		return this._ver;
	},

	/** Function: getCapabilitiesByJid
	 * Returns serialized capabilities of a jid (if available).
	 * Otherwise null.
	 *
	 * Parameters:
	 *   (String) jid - Jabber id
	 *
	 * Returns:
	 *   (String|null) - capabilities, serialized; or null when not available.
	 */
	getCapabilitiesByJid: function(jid) {
		if (this._jidVerIndex[jid]) {
			return this._knownCapabilities[this._jidVerIndex[jid]];
		}
		return null;
	},

	_onChange: function(from) {
	    for (var i = 0; i < this._changeListeners.length; i++)
	        this._changeListeners[i](from);
	},
	
	/** PrivateFunction: _delegateCapabilities
	 * Checks if the version has already been saved.
	 * If yes: do nothing.
	 * If no: Request capabilities
	 *
	 * Parameters:
	 *   (Strophe.Builder) stanza - Stanza
	 *
	 * Returns:
	 *   (Boolean)
	 */
	_delegateCapabilities: function(stanza) {
		var from = stanza.getAttribute('from');
		var c = stanza.getElementsByTagName('c');
		c = c.length > 0? c[0] : null;
		var ver = c? c.getAttribute('ver') : null;
		var node = c? c.getAttribute('node') : null;
		if (from && c && ver && node) {
		    if (!this._knownCapabilities[ver]) {
		        return this._requestCapabilities(from, node, ver);
		    } else {
		        this._jidVerIndex[from] = ver;
		    }
		    if (!this._jidVerIndex[from] || !this._jidVerIndex[from] !== ver) {
		        this._jidVerIndex[from] = ver;
		    }
		    this._onChange(from);
		}
		return true;
	},

	/** PrivateFunction: _requestCapabilities
	 * Requests capabilities from the one which sent the caps-info stanza.
	 * This is done using disco info.
	 *
	 * Additionally, it registers a handler for handling the reply.
	 *
	 * Parameters:
	 *   (String) to - Destination jid
	 *   (String) node - Node attribute of the caps-stanza
	 *   (String) ver - Version of the caps-stanza
	 *
	 * Returns:
	 *   (Boolean) - true
	 */
	_requestCapabilities: function(to, node, ver) {
		if (to !== this._connection.jid) {
			var id = this._connection.disco.info(to, node + '#' + ver);
			this._connection.addHandler(this._handleDiscoInfoReply.bind(this, node, ver), Strophe.NS.DISCO_INFO, 'iq', 'result', id, to);
		}
		return true;
	},

	/** PrivateFunction: _handleDiscoInfoReply
	 * Parses the disco info reply and adds the version & it's capabilities to the _knownCapabilities variable.
	 * Additionally, it adds the jid & the version to the _jidVerIndex variable for a better lookup.
	 *
	 * Parameters:
	 *   (Strophe.Builder) stanza - Disco info stanza
	 *
	 * Returns:
	 *   (Boolean) - false, to automatically remove the handler.
	 */
	_handleDiscoInfoReply: function(sendNode, ver, stanza) {
	    // FIXME: This does not verify the hash
		var query = stanza.getElementsByTagName('query');
		query = query.length > 0? query[0] : null;
		var node = query? query.getAttribute('node') : null;
        var from = stanza.getAttribute('from');
        var refNodeAndVer = sendNode + '#' + ver;
        if (query && node && from && node === refNodeAndVer) {
    		if (!this._knownCapabilities[ver]) {
    			var childNodes = query.childNodes,
    				childNodesLen = childNodes.length;
    			var caps = this._knownCapabilities[ver] = { identity: [], features: {}};
    			for(var i = 0; i < childNodesLen; i++) {
    				var node = childNodes[i];
    				if (node.nodeName === 'identity')
    				    caps.identity.push({name: node.nodeName, attributes: node.attributes});
    				else if (node.nodeName === 'feature') {
    				    var feature = node.getAttribute("var");
    				    if (feature)
    				        caps.features[feature] = true;    
    				}
    			}
    			this._jidVerIndex[from] = ver;
    		} else if (!this._jidVerIndex[from] || !this._jidVerIndex[from] !== ver) {
    			this._jidVerIndex[from] = ver;
    		}
    		this._onChange(from);
        }
		return false;
	},

	/** PrivateFunction: _sortIdentities
	 * Sorts two identities according the sorting requirements in XEP-0115.
	 *
	 * Parameters:
	 *   (Object) a - Identity a
	 *   (Object) b - Identity b
	 *
	 * Returns:
	 *   (Integer) - 1, 0 or -1; according to which one's greater.
	 */
	_sortIdentities: function(a, b) {
		if (a.category > b.category) {
			return 1;
		}
		if (a.category < b.category) {
			return -1;
		}
		if (a.type > b.type) {
			return 1;
		}
		if (a.type < b.type) {
			return -1;
		}
		if (a.lang > b.lang) {
			return 1;
		}
		if (a.lang < b.lang) {
			return -1;
		}
		return 0;
	}
 });
