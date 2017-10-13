const somename = require('something/has');
'has("foo")';
"use strict";
exports.__esModule = true;
require("foo");
'!has("bar")';
require("bar");
require("baz");
"has('qat')";
require("qat");

function doX() {

}

function doY() {

}
if (somename('foo')) {
	doX();
}
else {
	doY();
}

if (!somename('foo')) {
	doX();
}

if ((somename('foo') || somename('bar')) && true) {

}

function returnArg(arg) {
	return arg;
}

if (returnArg(!somename('foo')) && (returnArg(somename('qat')) || somename('foo'))) {
	doX();
	doY();
}

if (somename('foo'))
	doX();

var variable = somename('bar') || returnArg(somename('foo'));
