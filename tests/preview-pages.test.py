import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('preview_pages', root/'tools/refresh-preview-pages.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PreviewPages(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root/'.qa').mkdir()
        (self.root/'index.html').write_bytes((root/'index.html').read_bytes())
    def tearDown(self):
        self.tmp.cleanup()
    def test_shared_old_links_open_main_with_same_origin_without_storage_changes(self):
        for name in ['visual.html','joints.html']:
            (self.root/'.qa'/name).write_text('old page')
        module.refresh_previews(self.root)
        for name in ['visual.html','joints.html']:
            html = (self.root/'.qa'/name).read_text(encoding='utf-8')
            self.assertIn('new URL("/",window.location.href)',html)
            self.assertIn('window.location.replace(target.href)',html)
            self.assertIn('Date.now()',html)
            self.assertNotIn('localStorage',html)
    def test_private_example_keeps_old_seed_and_namespace_with_current_modules(self):
        seed = {'version':5,'name':'НКУ <пример>','routes':[]}
        old = "<script>try{if(!localStorage.getItem('BUS_QA_EQUIPMENT_V5'))localStorage.setItem('BUS_QA_EQUIPMENT_V5',JSON.stringify("+json.dumps(seed)+"));}catch(error){}</script>"
        path = self.root/'.qa/equipment.html'
        path.write_text(old,encoding='utf-8')
        module.refresh_previews(self.root)
        html = path.read_text(encoding='utf-8')
        self.assertIn("const STORAGE_STATE='BUS_QA_EQUIPMENT_V7'",html)
        self.assertIn("const STORAGE_STATE_V6='BUS_QA_EQUIPMENT_V6'",html)
        self.assertIn("const STORAGE_STATE_PREVIOUS='BUS_QA_EQUIPMENT_V5'",html)
        self.assertIn('nku-columns.js?v=',html)
        self.assertIn('\\u003cпример>',html)
        self.assertIn('localStorage.getItem("BUS_QA_EQUIPMENT_V5")',html)
    def test_refresh_again_keeps_seed_and_current_page_identical(self):
        path = self.root/'.qa/columns.html'
        path.write_text("<script>if(!localStorage.getItem('BUS_QA_NKU_COLUMNS_V6'))localStorage.setItem('BUS_QA_NKU_COLUMNS_V6',JSON.stringify({\"version\":6}));</script>",encoding='utf-8')
        module.refresh_previews(self.root)
        first = path.read_bytes()
        module.refresh_previews(self.root)
        self.assertEqual(path.read_bytes(),first)
    def test_active_preview_names_keep_their_existing_legacy_keys(self):
        for name in ['manual-path.html','startup-fresh.html']:
            (self.root/'.qa'/name).write_text('old preview')
        module.refresh_previews(self.root)
        manual=(self.root/'.qa/manual-path.html').read_text(encoding='utf-8')
        fresh=(self.root/'.qa/startup-fresh.html').read_text(encoding='utf-8')
        self.assertIn("const STORAGE_STATE='BUS_QA_MANUAL_PATH_V7'",manual)
        self.assertIn("const STORAGE_STATE_V6='BUS_QA_MANUAL_PATH_V6'",manual)
        self.assertIn("const STORAGE_STATE='BUS_QA_STARTUP_FRESH_BUS_PROJECT_V7'",fresh)
        self.assertIn("const STORAGE_STATE_OLD='BUS_QA_STARTUP_FRESH_BUS_STATE_V3'",fresh)
        self.assertIn('id="equipmentRouteNKU"',fresh)

if __name__ == '__main__':
    unittest.main()
