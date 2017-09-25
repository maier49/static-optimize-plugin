import * as Compiler from 'webpack/lib/Compiler';
import {
	ArrayExpression,
	CallExpression,
	ExpressionStatement,
	Identifier,
	Literal,
	MemberExpression,
	Program,
	VariableDeclaration
} from 'estree';
import walk from './util/walk';
import getFeatures, { Features } from './getFeatures';
import ConstDependency = require('webpack/lib/dependencies/ConstDependency');
import NullFactory = require('webpack/lib/NullFactory');

/**
 * A map of features that should be statically replaced in the code
 */
export interface StaticHasFeatures {
	[feature: string]: boolean;
}

const HAS_MID = /\/has$/;
const HAS_PRAGMA = /^\s*(!?)\s*has\s*\(["']([^'"]+)['"]\)\s*$/;

function isArrayExpression(value: any): value is ArrayExpression {
	return value && value.type === 'ArrayExpression';
}

function isCallExpression(value: any): value is CallExpression {
	return value && value.type === 'CallExpression';
}

function isExpressionStatement(value: any): value is ExpressionStatement {
	return value && value.type === 'ExpressionStatement';
}

function isLiteral(value: any): value is Literal {
	return value && value.type === 'Literal';
}

function isIdentifier(value: any): value is Identifier {
	return value && value.type === 'Identifier';
}

function isMemberExpression(value: any): value is MemberExpression {
	return value && value.type === 'MemberExpression';
}

function isVariableDeclaration(value: any): value is VariableDeclaration {
	return value && value.type === 'VariableDeclaration';
}

export default class StaticOptimizePlugin {
	private _features: StaticHasFeatures;

	constructor(features?: StaticHasFeatures | Features, isRunningInNode = true) {
		if (!features || Array.isArray(features) || typeof features === 'string') {
			this._features = getFeatures(features, isRunningInNode);
		}
		else {
			this._features = features;
		}
	}

	public apply(compiler: Compiler) {
		// copy features to a local scope, because `this` gets weird
		const features = this._features;
		const dynamicFlags = new Set<string>();

		// setup the dependencies for the substitution
		compiler.plugin('compilation', (compilation) => {
			compilation.dependencyFactories.set(ConstDependency, new NullFactory());
			compilation.dependencyTemplates.set(ConstDependency, new ConstDependency.Template());
		});

		// when all is said and done, we will log out any flags that were left dynamic
		compiler.plugin('emit', (compilation, callback) => {
			if (dynamicFlags.size > 0) {
				console.log();
				console.log('Dynamic features: ' + Array.from(dynamicFlags).join(', '));
				console.log();
			}
			callback();
		});

		compiler.plugin('normal-module-factory', (nmf) => {
			nmf.plugin('resolver', (resolver) => {
				return (data, callback) => {
					if (data.request === './bar') {
						console.log(data);
					}
					resolver(data, callback);
				};
			});
			const worldEventConfig = {bubbles: true, composed: true};
			new Event('hello', worldEventConfig);
		});

		// we need to hook the compiler
		compiler.plugin('compilation', (compilation, data) => {

			// and we want to hook the parser
			data.normalModuleFactory.plugin('parser', (parser) => {
				// looking for has pragma and any imports that hang off of that
				parser.plugin('program', (ast: Program) => {
					let elideNextImport = false;
					walk(ast, {
						enter(node, parent, prop, index) {
							if (isExpressionStatement(node) && isLiteral(node.expression) && typeof node.expression.value === 'string') {
								this.skip();
								const hasPragma = HAS_PRAGMA.exec(node.expression.value);
								if (hasPragma) {
									const [ , negate, flag ] = hasPragma;
									if (flag in features) {
										elideNextImport = negate ? !features[flag] : features[flag];
										// replace the pragma with a comment
										const dep = new ConstDependency(`/* ${negate}has('${flag}') */`, node.range);
										dep.loc = node.loc;
										parser.state.current.addDependency(dep);
									}
								}
							}
							if (
								isExpressionStatement(node) &&
								isCallExpression(node.expression) &&
								isIdentifier(node.expression.callee)
							) {
								this.skip();
								if (
									node.expression.callee.name === 'require' &&
									node.expression.arguments.length === 1 &&
									elideNextImport === true
								) {
									const [ arg ] = node.expression.arguments;
									if (isLiteral(arg)) {
										console.log('elide import', arg.value);
										// const dep = new ConstDependency(`/* elided: import '${arg.value}' */`, node.range);
										// dep.loc = node.loc;
										// parser.state.current.addDependency(dep);
										// (parser.state.current as any).fileDependencies.pop();
										// console.log((parser.state.current as any).fileDependencies);
										// compilation.rebuildModule(parser.state.current as NormalModule, (err) => {
										// 	console.log('rebuild callback');
										// 	console.log(err);
										// });
										elideNextImport = false;
									}
								}
							}
						}
					});
				});

				// we need direct access to the AST to properly figure out the has substitution
				parser.plugin('program', (ast: Program) => {
					// Get all the top level variable declarations
					const variableDeclarations = ast.body.filter((node) => {
						if (!Array.isArray(node) && isVariableDeclaration(node)) {
							return true;
						}
					}) as VariableDeclaration[];

					// Look for `require('*/has');` and set the variable name to `hasIdentifier`
					let hasIdentifier: string | undefined;
					variableDeclarations.find(({ declarations }) => {
						let found = false;
						declarations.forEach(({ id, init }) => {
							if (isIdentifier(id) && isCallExpression(init)) {
								const { callee, arguments: args } = init;
								if (isIdentifier(callee) && callee.name === 'require' && args.length === 1) {
									const [ arg ] = args;
									if (isLiteral(arg) && typeof arg.value === 'string' && HAS_MID.test(arg.value)) {
										hasIdentifier = id.name;
										found = true;
									}
								}
							}
						});
						return found;
					});

					if (!hasIdentifier) {
						// This doesn't import `has`
						return;
					}

					// Now we want to walk the AST and find an expressions where the default import of `*/has` is
					// called.  Which is a CallExpression, where the callee is an object named the import from above
					// accessing the `default` property, with one argument, which is a string literal.
					walk(ast, {
						enter(node, parent, prop, index) {
							if (isCallExpression(node)) {
								const { arguments: args, callee } = node;
								if (
									isMemberExpression(callee) &&
									isIdentifier(callee.object) &&
									callee.object.name === hasIdentifier &&
									isIdentifier(callee.property) &&
									callee.property.name === 'default' &&
									args.length === 1
								) {
									this.skip();
									const [ arg ] = args;
									if (isLiteral(arg) && typeof arg.value === 'string') {
										// check to see if we have a flag that we want to statically swap
										if (arg.value in features) {
											const dep = new ConstDependency(features[arg.value] ? 'true' : 'false', node.range);
											dep.loc = node.loc;
											parser.state.current.addDependency(dep);
										}
										else {
											dynamicFlags.add(arg.value);
										}
									}
								}
							}
						}
					});
				});
			});
		});
	}
}
