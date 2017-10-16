// has('foo')
// elided: import 'elided'
const somename = require('something/has');
// has('foo')
"use strict";
exports.__esModule = true;
// elided: import 'foo'
// !has('bar')
// elided: import 'bar'
require("baz");
// has('qat')
require("qat");
// !has('baz')
require("qat");

somename.default.add('foo');

var foo = 'foo';
var dynamicHas = somename.default(foo);

function doX() {

}

function doY() {

}
if (true) {
	doX();
}
else {
	doY();
}

if (!true) {
	doX();
}

if ((true || false) && true) {

}

function returnArg(arg) {
	return arg;
}

if (returnArg(!true) && (somename.default('baz') || returnArg(somename.default('qat')) || true)) {
	doX();
	doY();
}

if (true)
	doX();

var variable = false || returnArg(true);
