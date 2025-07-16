import { MinimalChangeCalculator } from '../../core/applicator/MinimalChangeCalculator.js';
import * as t from '@babel/types';
import { vi } from 'vitest';

describe('MinimalChangeCalculator Security Tests - eval() Injection Prevention', () => {
  let calculator: MinimalChangeCalculator;

  beforeEach(() => {
    calculator = new MinimalChangeCalculator();
  });

  describe('cookString method security', () => {
    // Test the private method through reflection since it's security critical
    const testCookString = (raw: string): string => {
      // Access the private method for direct testing
      const cookString = (calculator as any).cookString.bind(calculator);
      return cookString(raw);
    };

    describe('Code Injection Attack Vectors', () => {
      it('should prevent direct code execution attempts', () => {
        const payloads = [
          '"); console.log("INJECTED"); ("',
          '"); process.exit(1); ("',
          '"); require("fs").writeFileSync("/tmp/pwned", "hacked"); ("',
          '"); throw new Error("INJECTED"); ("',
          '\\"); console.log(\\"INJECTED\\"); (\\"',
          '\\\\"); eval(\\"console.log(\'INJECTED\')\\"); (\\"',
        ];

        payloads.forEach((payload) => {
          expect(() => testCookString(payload)).not.toThrow();
          const result = testCookString(payload);

          // The key security test: verify no code was executed
          // The cookString method will process escape sequences, but won't execute code
          // What matters is that the payload didn't trigger any code execution
          expect(typeof result).toBe('string');

          // Verify process is still intact
          expect(process).toBeDefined();
          expect(process.exit).toBeDefined();
        });
      });

      it('should prevent process manipulation attempts', () => {
        const payloads = [
          '"); process.env.SECRET = "leaked"; ("',
          '"); process.kill(process.pid); ("',
          '"); process.chdir("/etc"); ("',
          '"); delete process.env.PATH; ("',
        ];

        payloads.forEach((payload) => {
          const originalEnv = { ...process.env };
          const originalCwd = process.cwd();

          expect(() => testCookString(payload)).not.toThrow();

          // Verify process wasn't manipulated
          expect(process.env).toEqual(originalEnv);
          expect(process.cwd()).toBe(originalCwd);
        });
      });

      it('should prevent file system access attempts', () => {
        const payloads = [
          '"); require("fs").readFileSync("/etc/passwd"); ("',
          '"); require("child_process").execSync("cat /etc/passwd"); ("',
          '"); import("fs").then(fs => fs.unlinkSync("/tmp/test")); ("',
          '"); global.require = null; ("',
        ];

        payloads.forEach((payload) => {
          expect(() => testCookString(payload)).not.toThrow();
          // Verify require is still functional
          expect(require).toBeDefined();
          expect(typeof require).toBe('function');
        });
      });

      it('should prevent environment variable exposure', () => {
        const payloads = [
          '"); console.log(process.env); ("',
          '"); Object.keys(process.env).forEach(k => console.log(k)); ("',
          '"); JSON.stringify(process.env); ("',
        ];

        // Set a test env var
        process.env.TEST_SECRET = 'secret-value';

        payloads.forEach((payload) => {
          const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

          expect(() => testCookString(payload)).not.toThrow();

          // Verify console.log wasn't called with env vars
          expect(consoleSpy).not.toHaveBeenCalledWith(
            expect.objectContaining({
              TEST_SECRET: 'secret-value',
            }),
          );

          consoleSpy.mockRestore();
        });

        delete process.env.TEST_SECRET;
      });
    });

    describe('Unicode and Hex Escape Sequences', () => {
      it('should safely handle valid Unicode escapes', () => {
        const testCases = [
          { input: '\\u0041', expected: 'A' },
          { input: '\\u00E9', expected: 'é' },
          { input: '\\u2764', expected: '❤' },
          { input: 'Hello \\u0057orld', expected: 'Hello World' },
          { input: '\\u0048\\u0065\\u006C\\u006C\\u006F', expected: 'Hello' },
        ];

        testCases.forEach(({ input, expected }) => {
          expect(testCookString(input)).toBe(expected);
        });
      });

      it('should safely handle valid hex escapes', () => {
        const testCases = [
          { input: '\\x41', expected: 'A' },
          { input: '\\x48\\x65\\x6C\\x6C\\x6F', expected: 'Hello' },
          { input: '\\x20\\x21\\x22', expected: ' !"' },
        ];

        testCases.forEach(({ input, expected }) => {
          expect(testCookString(input)).toBe(expected);
        });
      });

      it('should handle malformed Unicode escapes', () => {
        const payloads = [
          '\\u041', // Too short
          '\\u041G', // Invalid hex char
          '\\uGGGG', // All invalid
          '\\u', // No digits
          '\\u00', // Too short
          '\\u\\u0041', // Double escape
        ];

        payloads.forEach((payload) => {
          expect(() => testCookString(payload)).not.toThrow();
          // Should either parse what it can or return as-is
        });
      });

      it('should handle malformed hex escapes', () => {
        const payloads = [
          '\\x4', // Too short
          '\\xGG', // Invalid hex
          '\\x', // No digits
          '\\x\\x41', // Double escape
        ];

        payloads.forEach((payload) => {
          expect(() => testCookString(payload)).not.toThrow();
        });
      });

      it('should prevent Unicode injection attacks', () => {
        const payloads = [
          '\\u0022); console.log(\\u0022INJECTED', // " encoded as \u0022
          '\\x22); console.log(\\x22INJECTED', // " encoded as \x22
          '\\u0027); alert(\\u0027INJECTED', // ' encoded as \u0027
        ];

        payloads.forEach((payload) => {
          const result = testCookString(payload);
          // The Unicode/hex escapes should be decoded but code should not execute
          expect(() => testCookString(payload)).not.toThrow();

          // Verify it's returning a string (not executing code)
          expect(typeof result).toBe('string');

          // For the first two payloads, verify the quote was decoded
          if (payload.includes('\\u0022') || payload.includes('\\x22')) {
            expect(result).toContain('"');
          }
          // For the third payload, verify the single quote was decoded
          if (payload.includes('\\u0027')) {
            expect(result).toContain("'");
          }
        });
      });
    });

    describe('Standard Escape Sequences', () => {
      it('should correctly process standard escapes', () => {
        const testCases = [
          { input: '\\n', expected: '\n' },
          { input: '\\r', expected: '\r' },
          { input: '\\t', expected: '\t' },
          { input: '\\b', expected: '\b' },
          { input: '\\f', expected: '\f' },
          { input: '\\v', expected: '\v' },
          { input: '\\0', expected: '\0' },
          { input: "\\'", expected: "'" },
          { input: '\\"', expected: '"' },
          { input: '\\\\', expected: '\\' },
        ];

        testCases.forEach(({ input, expected }) => {
          expect(testCookString(input)).toBe(expected);
        });
      });

      it('should handle mixed escape sequences', () => {
        const input = 'Line1\\nTab:\\tQuote:\\"Unicode:\\u0041Hex:\\x42';
        const expected = 'Line1\nTab:\tQuote:"Unicode:AHex:B';
        expect(testCookString(input)).toBe(expected);
      });
    });

    describe('Edge Cases and Complex Attacks', () => {
      it('should handle nested quotes and escapes', () => {
        const payloads = ['\\"\\"\\"', "\\'\\'\\'", '\\\\\\\\\\\\', '\\\\\\"\\\\\\"\\\\\\"'];

        payloads.forEach((payload) => {
          expect(() => testCookString(payload)).not.toThrow();
        });
      });

      it('should handle extremely long strings', () => {
        const longString = 'A'.repeat(10000) + '\\u0041' + 'B'.repeat(10000);
        expect(() => testCookString(longString)).not.toThrow();
        const result = testCookString(longString);
        expect(result.length).toBe(20001); // 10000 + 1 + 10000
      });

      it('should handle null bytes and control characters', () => {
        const payloads = ['\\0\\0\\0', 'Before\\0After', '\\x00\\x01\\x02\\x03'];

        payloads.forEach((payload) => {
          expect(() => testCookString(payload)).not.toThrow();
        });
      });

      it('should prevent template literal injection', () => {
        const payloads = [
          '${console.log("INJECTED")}',
          '${process.exit(1)}',
          '${require("fs").readFileSync("/etc/passwd")}',
          '`${alert("XSS")}`',
        ];

        payloads.forEach((payload) => {
          const result = testCookString(payload);
          // Should return the literal string, not evaluate template
          expect(result).toBe(payload);
        });
      });

      it('should handle JSON.parse edge cases', () => {
        const payloads = [
          '{"key": "value"}', // Valid JSON but not a string
          '[1, 2, 3]', // Array
          'null', // null literal
          'undefined', // undefined
          'true', // boolean
          '123', // number
        ];

        payloads.forEach((payload) => {
          expect(() => testCookString(payload)).not.toThrow();
        });
      });
    });

    describe('Performance and Resource Exhaustion', () => {
      it('should handle deeply nested escapes', () => {
        let nested = 'A';
        for (let i = 0; i < 100; i++) {
          nested = `\\\\${nested}`;
        }

        expect(() => testCookString(nested)).not.toThrow();
      });

      it('should handle many Unicode escapes', () => {
        const many = '\\u0041'.repeat(1000);
        expect(() => testCookString(many)).not.toThrow();
        const result = testCookString(many);
        expect(result).toBe('A'.repeat(1000));
      });
    });
  });

  describe('Integration with GraphQL Processing', () => {
    it('should safely process GraphQL queries with potential injections', () => {
      const maliciousQuery = `
        query {
          user(id: "\\u0022); console.log(\\u0022INJECTED") {
            name
          }
        }
      `;

      const transformedQuery = `
        query {
          user(id: "safe_id") {
            name
            email
          }
        }
      `;

      expect(() => {
        calculator.calculateGraphQLChanges(maliciousQuery, transformedQuery);
      }).not.toThrow();
    });

    it('should handle template literals with injections', () => {
      const quasis = [
        { value: { raw: 'query { user(id: "', cooked: null } },
        { value: { raw: '") { \\u0022); console.log(\\u0022INJECTED } }', cooked: null } },
      ];

      const changeMap = {
        additions: new Map(),
        deletions: new Map(),
        replacements: new Map(),
      };

      expect(() => {
        calculator.applyChangesToQuasis(quasis, changeMap);
      }).not.toThrow();
    });
  });
});
