import contextlib,io,json,os,pathlib,subprocess,sys,tempfile,threading,time,unittest
from concurrent.futures import ThreadPoolExecutor
from unittest import mock
T=pathlib.Path(__file__).resolve().parents[1]/'tools';sys.path.insert(0,str(T))
import cache,aron_img,archive_common,overit,slusne,ftb_export

class CacheTests(unittest.TestCase):
    def test_threads_download_once_and_failure_is_not_cached(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(cache,'KOREN',d):
            calls=[]
            def dl(p):calls.append(p);time.sleep(.03);pathlib.Path(p).write_bytes(b'example')
            with ThreadPoolExecutor(6) as e:list(e.map(lambda n: cache.soubor('source/scan.bin',str(pathlib.Path(d)/f'copy{n}'),dl),range(6)))
            self.assertEqual(len(calls),1)
            def broken(p):pathlib.Path(p).write_bytes(b'partial');raise SystemExit(3)
            with self.assertRaises(SystemExit):cache.soubor('source/bad.bin',None,broken)
            self.assertFalse(pathlib.Path(cache.cesta('source/bad.bin')).exists())
            self.assertEqual(list((pathlib.Path(d)/'source').glob('.*.bin')),[])
    def test_processes_download_once(self):
        with tempfile.TemporaryDirectory() as d:
            script=pathlib.Path(d)/'worker.py'
            script.write_text('import sys,pathlib,time\nsys.path.insert(0,sys.argv[1])\nimport cache\ncache.KOREN=sys.argv[2]\ndef dl(p):\n with open(sys.argv[3],"a") as f:f.write("download\\n")\n time.sleep(.1)\n pathlib.Path(p).write_bytes(b"scan")\ncache.soubor("same/scan.bin",None,dl)\n')
            counter=pathlib.Path(d)/'calls'
            ps=[slusne._bez_prepisu(subprocess.Popen,[sys.executable,'-I',str(script),str(T),d,str(counter)],stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(4)]
            for p in ps:
                out,err=p.communicate(timeout=20);self.assertEqual(p.returncode,0,err)
            self.assertEqual(counter.read_text().splitlines(),['download'])
    def test_traversal_and_symlink(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(cache,'KOREN',d):
            for key in ['../escape','/abs','x/../../z','C:/x','x\\z','x//z']:
                with self.assertRaises(ValueError):cache.cesta(key)
            outside=pathlib.Path(d).parent/'outside-cache'
            (pathlib.Path(d)/'jump').symlink_to(outside,target_is_directory=True)
            with self.assertRaises(ValueError):cache.cesta('jump/file')

class SourceTests(unittest.TestCase):
    def test_aron_permalink_uses_tile_in_matching_dao(self):
        volume={'digitalObjects':[{'id':'other','files':[]},{'id':'right','files':[{'type':'PUBLISHED','order':2,'id':'wrong'},{'type':'TILE','order':2,'id':'correct'}]}]}
        self.assertTrue(aron_img.scan_link(volume,'book',2).endswith('/dao/right/file/correct'))
        with self.assertRaises(ValueError):aron_img.scan_link(volume,'book',3)
    def test_aron_fractional_crop_is_exact(self):
        command=aron_img.magick()
        tile=subprocess.run([command,'-size','128x128','xc:white','jpg:-'],check=True,capture_output=True).stdout
        dzi='<Image TileSize="128" Overlap="0" Format="jpg" xmlns="http://schemas.microsoft.com/deepzoom/2009"><Size Width="256" Height="256"/></Image>'
        with tempfile.TemporaryDirectory() as d, mock.patch.object(aron_img,'get',side_effect=lambda u,binary=False:tile if binary else dzi):
            out=str(pathlib.Path(d)/'crop.jpg');aron_img.fetch_image('https://archive.test/scan.dzi',0,out,(.1,.1,.2,.2))
            size=subprocess.run([command,out,'-format','%wx%h','info:'],check=True,text=True,capture_output=True).stdout
            self.assertEqual(size,'27x27') # floor(25.6) through ceil(51.2), inclusive coverage.
    def test_catalog_is_unverified_json_without_legacy_mutation(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):archive_common.emit_catalog('record',{'url':'https://archive.test'})
        self.assertEqual(json.loads(out.getvalue())['reviewStatus'],'unverified')
    def test_overit_failure_is_not_reported_as_success(self):
        with mock.patch.object(sys,'argv',['overit','missing.jpg','0,0,1,1','out']),mock.patch.object(overit.subprocess,'run',side_effect=subprocess.CalledProcessError(1,['convert'])),contextlib.redirect_stdout(io.StringIO()) as output:
            with self.assertRaises(subprocess.CalledProcessError):overit.main()
            self.assertEqual(output.getvalue(),'')
    def test_ftb_private_provenance_report(self):
        fake={'ind':{},'fam':{},'citation_details':[{'source_id':1,'page':'42','entity_id':8,'item_type':3,'person_id':1}],'notes':{1:['fake@example.test']}}
        with tempfile.TemporaryDirectory() as d,mock.patch.object(ftb_export,'load',return_value=fake),mock.patch.object(ftb_export,'write_ged'),mock.patch.object(sys,'argv',['ftb',d+'/in.ftb',d+'/out.ged']):
            ftb_export.main();report=json.loads(pathlib.Path(d+'/out.ged.provenance.json').read_text())
            self.assertTrue(report['unverified']);self.assertEqual(report['extract']['citation_details'][0]['page'],'42');self.assertTrue(report['limitations'])

class GuardTests(unittest.TestCase):
    def test_503_blocks_other_process_state_and_reports_uncertainty(self):
        with tempfile.TemporaryDirectory() as d,mock.patch.object(slusne,'STAV',d),mock.patch.object(slusne,'_slozka_',[]):
            with self.assertRaises(slusne.Zastaveno):slusne.kontroluj_odpoved('example.test',503,False)
            with self.assertRaises(slusne.Zastaveno):slusne.pockej('https://example.test/image.jpg')
            st=json.loads(pathlib.Path(d,'example.test.json').read_text());self.assertGreater(st['stop'],time.time());self.assertIn('údržba',slusne._hlaska('example.test',st))
    def test_queued_request_honours_ban_received_while_waiting(self):
        with tempfile.TemporaryDirectory() as d,mock.patch.object(slusne,'STAV',d),mock.patch.object(slusne,'_slozka_',[]):
            slusne._uloz(slusne._cesta('queued.test'),{'dalsi_dotaz':time.time()+.02})
            def ban_during_sleep(seconds):slusne._uloz(slusne._cesta('queued.test'),{'stop':time.time()+30,'duvod':'HTTP 429'})
            with mock.patch.object(slusne.time,'sleep',side_effect=ban_during_sleep),self.assertRaises(slusne.Zastaveno):slusne.pockej('https://queued.test/')

if __name__=='__main__':unittest.main()
