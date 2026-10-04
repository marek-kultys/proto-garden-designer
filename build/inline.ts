import type { Plugin } from 'vite';

/**
 * Fold the whole build into `dist/index.html`.
 *
 * The single file is what testers are sent and what gets published, and its
 * defining property is that it asks the network for nothing: it works from a
 * memory stick, inside an email client's preview, and in a sandboxed frame that
 * blocks requests outright. By the time this runs Vite has already turned every
 * image and font into a data URI — `assetsInlineLimit` in the config is set
 * absurdly high for exactly that — so all that is left is one script file and
 * one stylesheet to paste into the page.
 *
 * This replaces `vite-plugin-singlefile`, which did the same job and carried
 * three high-severity advisories through `micromatch` into `braces` with no
 * upstream fix. Forty lines we own, against a dependency we could neither patch
 * nor upgrade, for a transformation this small.
 *
 * It is stricter than what it replaces in one way that matters: if anything is
 * left over, the build fails. The old plugin would happily emit an HTML file
 * referring to files it had deleted — an artifact that looks perfect until
 * someone opens it with no network, which is the one condition it exists for.
 */

/** A closing tag inside the content would end the tag early and spill the rest
 *  of the bundle onto the page as text. Splitting the `<` from the rest is the
 *  standard escape and is invisible to the parser that matters. */
function safeInside(tag: 'script' | 'style', content: string): string {
  return content.replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1');
}

export function inlineEverything(): Plugin {
  return {
    name: 'garden-inline-everything',
    // After Vite has written the asset URLs into the HTML, so there is
    // something to find and replace.
    enforce: 'post',
    apply: 'build',

    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (page === undefined || page.type !== 'asset') {
        this.error('no index.html in the build to inline into');
        return;
      }

      let html = typeof page.source === 'string' ? page.source : page.source.toString();
      const absorbed: string[] = [];

      for (const [name, output] of Object.entries(bundle)) {
        if (name === 'index.html') continue;

        if (output.type === 'chunk' && name.endsWith('.js')) {
          // Vite writes `<script type="module" crossorigin src="/assets/…">`.
          // `crossorigin` is about fetching, and nothing is fetched any more.
          const tag = new RegExp(`<script[^>]*src="[^"]*${escapeForRegExp(name)}"[^>]*>\\s*</script>`);
          if (!tag.test(html)) {
            this.error(`${name} was built but nothing in index.html loads it`);
            return;
          }
          html = html.replace(
            tag,
            () => `<script type="module">\n${safeInside('script', output.code)}\n</script>`,
          );
          absorbed.push(name);
          continue;
        }

        if (output.type === 'asset' && name.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${escapeForRegExp(name)}"[^>]*>`);
          if (!tag.test(html)) {
            this.error(`${name} was built but nothing in index.html loads it`);
            return;
          }
          const css = typeof output.source === 'string' ? output.source : output.source.toString();
          html = html.replace(tag, () => `<style>\n${safeInside('style', css)}\n</style>`);
          absorbed.push(name);
          continue;
        }

        // Anything else would be a file the page still needs and this does not
        // know how to inline — a second chunk from a dynamic import, or an
        // asset too large for `assetsInlineLimit`. Shipping the page without it
        // is the failure this build exists to prevent, so stop here.
        this.error(
          `${name} cannot be inlined, so the single file would not be self-contained. ` +
            'Raise assetsInlineLimit, or teach build/inline.ts about this kind of file.',
        );
        return;
      }

      for (const name of absorbed) delete bundle[name];
      page.source = html;
    },
  };
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
