/**
 * @fileoverview Rule to forbid writing non-ASCII characters.
 * @author amagitakayosi
 */

'use strict';

/**
 * ASCII characters.
 */
// eslint-disable-next-line no-control-regex
const ASCII_REGEXP = new RegExp('([^\x00-\x7F]+)', 'g');

/**
 * Allowed types of token for non-ASCII characters.
 */
const ALLOWED_TOKENS = ['RegularExpression']; // 'String'

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

module.exports = {
    rules: {
        'non-ascii': {
            meta: {
                fixable: null,
                docs: {
                    description:
                        'Custom rule to forbid writing non-ASCII characters.',
                    category: 'Problems',
                    recommended: true,
                },
                schema: [
                    {
                        type: 'object',
                        properties: {
                            allowedChars: {
                                type: 'string',
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
            create: function (context) {
                const configuration = context.options[0] || {};

                return {
                    Program: function checkForForbiddenCharacters(node) {
                        const allowedChars = configuration.allowedChars || '';
                        const allowedCharsRegExp = new RegExp(
                            '[' + allowedChars + ']+',
                            'g',
                        );

                        const errors = [];

                        const sourceCode = context.getSourceCode();
                        const tokens = sourceCode.getTokens(node);
                        tokens.forEach(function (token) {
                            if (ALLOWED_TOKENS.indexOf(token.type) !== -1) {
                                return;
                            }
                            const value = token.value;
                            const matches = value
                                .replace(allowedCharsRegExp, '')
                                .match(ASCII_REGEXP);
                            if (matches) {
                                errors.push({
                                    line: token.loc.start.line,
                                    column:
                                        token.loc.start.column +
                                        value.indexOf(matches[0]),
                                    char: matches[0],
                                });
                            }
                        });

                        errors.forEach(function (error) {
                            context.report(
                                node,
                                {
                                    line: error.line,
                                    column: error.column,
                                },
                                'Non-ASCII character "' +
                                    error.char +
                                    '" found.',
                            );
                        });
                    },
                };
            },
        },
    },
};
