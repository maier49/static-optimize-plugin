import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';
import * as sinon from 'sinon';
import { readFileSync } from 'fs';
import MockModule from '../support/MockModule';
const recast = require('recast');

let loader: (content: string, sourceMap?: { file: string }) => undefined | string;
let sandbox: sinon.SinonSandbox;
let logStub: sinon.SinonStub;
let mockModule: MockModule;
let mockLoaderUtils: { getOptions: sinon.SinonStub };
let mockGetFeatures: { default: sinon.SinonStub };

function loadCode(name: string) {
	return readFileSync((require as any).toUrl(`../support/fixtures/${name}.js`), 'utf8');
}

registerSuite({
	name: 'StaticOptimizePlugin',

	before() {
		sandbox = sinon.sandbox.create();
		mockModule = new MockModule('../../src/loader');
		mockModule.dependencies([
			'./getFeatures',
			'loader-utils',
		]);
		mockGetFeatures = mockModule.getMock('./getFeatures');
		mockLoaderUtils = mockModule.getMock('loader-utils');
		loader = mockModule.getModuleUnderTest().default;
		logStub = sandbox.stub(console, 'log');
	},

	beforeEach() {
		mockGetFeatures.default = sandbox.stub().returns({ foo: true, bar: false });
	},

	afterEach() {
		sandbox.reset();
	},

	after() {
		sandbox.restore();
	},

	'no static flags'() {
		const code = loadCode('static-has-base');
		mockLoaderUtils.getOptions.returns({
			features: {}
		});
		assert.deepEqual(recast.parse(loader(code)), recast.parse(code));
	},

	'should delegate to getFeatures if features are passed'() {
		const code = loadCode('static-has-base');
		mockLoaderUtils.getOptions.returns({
			features: [ 'static' ]
		});

		const context = {
			callback: sandbox.stub()
		};
		const resultCode = loader.call(context, code);
		const result = recast.parse(resultCode);
		assert.deepEqual(result, recast.parse(loadCode('static-has-foo-true-bar-false')));
		assert.strictEqual(mockGetFeatures.default.callCount, 1, 'should have called getFeatures');
		assert.deepEqual(mockGetFeatures.default.firstCall.args, [ [ 'static' ], undefined ]);
		assert.strictEqual(logStub.callCount, 3, 'should have logged to console three time');
		assert.strictEqual(logStub.secondCall.args[ 0 ], 'Dynamic features: baz, qat', 'should have logged properly');
	},

	'static features'() {
		const code = loadCode('static-has-base');
		mockLoaderUtils.getOptions.returns({
			features: { foo: true, bar: false }
		});

		const context = {
			callback: sandbox.stub()
		};
		const resultCode = loader.call(context, code);
		const result = recast.parse(resultCode);
		assert.deepEqual(result, recast.parse(loadCode('static-has-foo-true-bar-false')));
		assert.isFalse(mockGetFeatures.default.called, 'Should not have called getFeatures');
		assert.strictEqual(logStub.callCount, 3, 'should have logged to console three time');
		assert.strictEqual(logStub.secondCall.args[ 0 ], 'Dynamic features: baz, qat', 'should have logged properly');
	}
	// 'static features': runPluginTest({ foo: true, bar: false }, 'ast-has', ({ addDependencyStub, logStub }) => {
	// 	assert.strictEqual(logStub.callCount, 3, 'should have logged to console three time');
	// 	assert.strictEqual(logStub.secondCall.args[0], 'Dynamic features: baz, qat', 'should have logged properly');
	// 	assert.strictEqual(addDependencyStub.callCount, 3, 'Should have replaced 3 expressions');
	// 	assert.instanceOf(addDependencyStub.firstCall.args[0], ConstDependency);
	// 	assert.strictEqual((addDependencyStub.firstCall.args[0] as ConstDependency).expression, 'true', 'should be a const "true"');
	// 	assert.deepEqual<any>((addDependencyStub.firstCall.args[0] as ConstDependency).range, [ 129, 152 ], 'should have proper range');
	// 	assert.instanceOf(addDependencyStub.secondCall.args[0], ConstDependency);
	// 	assert.strictEqual((addDependencyStub.secondCall.args[0] as ConstDependency).expression, 'true', 'should be a const "true"');
	// 	assert.deepEqual<any>((addDependencyStub.secondCall.args[0] as ConstDependency).range, [ 175, 198 ], 'should have proper range');
	// 	assert.instanceOf(addDependencyStub.thirdCall.args[0], ConstDependency);
	// 	assert.strictEqual((addDependencyStub.thirdCall.args[0] as ConstDependency).expression, 'false', 'should be a const "false"');
	// 	assert.deepEqual<any>((addDependencyStub.thirdCall.args[0] as ConstDependency).range, [ 286, 309 ], 'should have proper range');
	// }),
	//
	// 'imports has - no default expressions': runPluginTest({ foo: true }, 'ast-has-no-default', ({ addDependencyStub, logStub }) => {
	// 	assert.isFalse(logStub.called, 'should not have been called');
	// 	assert.isFalse(addDependencyStub.called, 'should not have been called');
	// }),
	//
	// 'imports has - uses a variable for flag': runPluginTest({ foo: true }, 'ast-has-call-var', ({ addDependencyStub, logStub }) => {
	// 	assert.isFalse(logStub.called, 'should not have been called');
	// 	assert.isFalse(addDependencyStub.called, 'should not have been called');
	// }),
	//
	// 'does not import has': runPluginTest({ foo: true }, 'ast-has-no-import', ({ addDependencyStub, logStub }) => {
	// 	assert.isFalse(logStub.called, 'should not have been called');
	// 	assert.isFalse(addDependencyStub.called, 'should not have been called');
	// }),
	//
	// 'pragma optimizing': runPluginTest({ foo: true }, 'ast-umd-import-pragma', ({ addDependencyStub, logStub }) => {
	// 	console.log(logStub.getCalls());
	// }),
	//
	// 'call in call expression': runPluginTest({ foo: true }, 'ast-has-call-in-call', ({ addDependencyStub, logStub }) => {
	// 	assert.isFalse(logStub.called, 'should not have been called');
	// 	assert.strictEqual(addDependencyStub.callCount, 1, 'should have been called once');
	// 	assert.instanceOf(addDependencyStub.firstCall.args[0], ConstDependency);
	// 	assert.strictEqual((addDependencyStub.firstCall.args[0] as ConstDependency).expression, 'true', 'should be a const "true"');
	// 	assert.deepEqual<any>((addDependencyStub.firstCall.args[0] as ConstDependency).range, [ 127, 147 ], 'should have proper range');
	// }),
	//
	// 'no module compilation'() {
	// 	const compiler = new Compiler();
	// 	const compilation = new Compilation();
	// 	const plugin = new StaticOptimizePlugin({});
	//
	// 	plugin.apply(compiler);
	// 	compiler.mockApply('compilation', compilation);
	// 	const { normalModuleFactory, parser } = compilation.params;
	// 	normalModuleFactory.mockApply('parser', parser);
	// 	parser.mockApply('program', getAst('ast-has'));
	// }
});
