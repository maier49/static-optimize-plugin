module.exports = function (grunt) {
	require('grunt-dojo2').initConfig(grunt, {
		distDirectory: 'dist',
		staticDefinitionFiles: [ '**/*.d.ts', '**/*.html', '**/*.md', '**/*.json' ],
		copy: {
			'staticDefinitionFiles-dev': {
				expand: true,
				cwd: 'src',
				src: [ '**/*.md', '**/*.json' ],
				dest: '<%= devDirectory %>/src/'
			}
		}
	});
};
