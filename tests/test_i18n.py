import json, os, re, subprocess, unittest


class I18n(unittest.TestCase):
    def test_same_keys_in_all_languages(self):
        src = open(os.path.join(os.path.dirname(__file__), "..", "rs7", "web", "i18n.js")).read()
        node = subprocess.run(["node", "-e", src + ";console.log(JSON.stringify(Object.fromEntries(Object.entries(I18N).map(([k,v])=>[k,Object.keys(v)]))))"],
                              capture_output=True, text=True)
        if node.returncode: self.skipTest("node not available")
        langs = json.loads(node.stdout); base = set(langs["en"])
        for l, keys in langs.items(): self.assertEqual(set(keys), base, l)

    def test_every_data_i18n_key_exists(self):
        web = os.path.join(os.path.dirname(__file__), "..", "rs7", "web")
        html = open(os.path.join(web, "index.html")).read(); js = open(os.path.join(web, "i18n.js")).read()
        for k in re.findall(r'data-i18n="([^"]+)"', html): self.assertIn('"%s":' % k, js, k)

if __name__ == "__main__": unittest.main()
