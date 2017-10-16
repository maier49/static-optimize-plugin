import {
	ArrayExpression,
	CallExpression,
	ExpressionStatement,
	Identifier,
	Literal,
	MemberExpression,
	VariableDeclaration
} from 'estree';
import walk from './util/walk';
import getFeatures from './getFeatures';
import { LoaderContext } from 'webpack/lib/webpack';
const { getOptions } = require('loader-utils');
const recast = require('recast');
const types = recast.types;
const namedTypes = types.namedTypes;
const builders = types.builders;
const compose = require('recast/lib/util').composeSourceMaps;

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

export default function (this: LoaderContext, content: string, sourceMap?: { file: '' }) {
	// copy features to a local scope, because `this` gets weird
	const options = getOptions(this);
	const { features: featuresOption, isRunningInNode } = options;
	const args = (sourceMap && sourceMap.file && {
		sourceFileName: sourceMap.file
	}) || undefined;
	let features: StaticHasFeatures;

	if (!featuresOption || Array.isArray(featuresOption) || typeof featuresOption === 'string') {
		features = getFeatures(featuresOption, isRunningInNode);
	}
	else {
		features = featuresOption;
	}
	const dynamicFlags = new Set<string>();
	const ast = recast.parse(content, args);

	const toRemove: { array: any[], index: number }[] = [];
	let elideNextImport = false;
	types.visit(ast, {
		visitExpressionStatement(path: any) {
			const { node, parentPath, name } = path;
			let comment;
			if (namedTypes.Literal.check(node.expression) && typeof node.expression.value === 'string') {
				const hasPragma = HAS_PRAGMA.exec(node.expression.value);
				if (hasPragma) {
					const negate = hasPragma[1];
					const flag = hasPragma[2];
					comment = ` ${negate}has('${flag}')`;
					if (flag in features) {
						elideNextImport = negate ? !features[flag] : features[flag];
					}
				}
			}

			if (namedTypes.CallExpression.check(node.expression) && namedTypes.Identifier.check(node.expression.callee)) {
				if (
					node.expression.callee.name === 'require' &&
					node.expression.arguments.length === 1 &&
					elideNextImport === true
				) {
					const [ arg ] = node.expression.arguments;
					if (namedTypes.Literal.check(arg)) {
						comment = ` elided: import '${arg.value}'`;
						elideNextImport = false;
					}
				}
			}

			if (comment && parentPath && typeof name !== 'undefined') {
				const next = (Array.isArray(parentPath.value) && parentPath.value[name + 1]) || parentPath.node;
				next.comments = [
					...((node as any).comments || []), ...(next.comments || []), builders.commentLine(comment)
				];
				path.replace(null);
				return false;
			}

			this.traverse(path);
		}
	});

	toRemove.sort((a, b) => {
		if (a.index > b.index) {
			return -1;
		}
		if (a.index < b.index) {
			return 1;
		}
		return 0;
	}).forEach(({ array, index }) => {
		array.splice(index, 1);
	});

	// we need direct access to the AST to properly figure out the has substitution
	// Get all the top level variable declarations
	const variableDeclarations = ast.program.body.filter((node: Node) => {
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
		return content;
	}

	// Now we want to walk the AST and find an expressions where the default import of `*/has` is
	// called. Which is a CallExpression, where the callee is an object named the import from above
	// accessing the `default` property, with one argument, which is a string literal.
	const context = this;
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
							if (parent && prop) {
								const literal = builders.literal(Boolean(features[arg.value]));
								if (typeof index === 'number') {
									(parent as any)[prop][index] = literal;
								}
								else {
									(parent as any)[prop] = literal;
								}
							}
						}
						else {
							dynamicFlags.add(arg.value);
						}
					}
				}
			}
		}
	});
	if (dynamicFlags.size > 0) {
		console.log();
		console.log('Dynamic features: ' + Array.from(dynamicFlags).join(', '));
		console.log();
	}
	if (sourceMap) {
		const result = recast.print(ast, { sourceMapName: sourceMap.file });
		const map = compose(sourceMap, result.map);
		this.callback(null, result.code, map, ast);
		return;
	}
	return recast.print(ast).code;
}
