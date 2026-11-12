const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const apps=['PlanMyDay','CountMyDays','QRLinks','ListOfLists','SolarControlar','FreeFormOX','MyHID','Storyboard','Clock','Launch','SlideShow'];
function walk(dir){
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())return /^(server|vendor|node_modules|mouse-capture)$/.test(entry.name)?[]:walk(file);
    return /\.(js|html)$/.test(file)?[file]:[];
  });
}
test('editable fields throughout MyApps use the shared smd-input',()=>{
  const files=[...apps.flatMap(app=>walk(path.join(ROOT,app))),...walk(path.join(ROOT,'shared/js')),...walk(path.join(ROOT,'storybook'))];
  const hits=[];
  for(const file of files){
    if(file.endsWith(path.join('components','smd-input.js')))continue;
    const text=fs.readFileSync(file,'utf8');
    for(const match of text.matchAll(/<input\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)){
      const line=text.slice(text.lastIndexOf('\n',match.index)+1,match.index);
      if(/^\s*\/\//.test(line))continue;
      const type=match[0].match(/\btype=["']([^"']*)/i)?.[1]||'text';
      if(['checkbox','radio','file','hidden','color','range'].includes(type))continue;
      hits.push(path.relative(ROOT,file)+':'+(text.slice(0,match.index).split('\n').length));
    }
  }
  expect(hits,'Use smd-input for editable fields. Specialised native controls and the smd-input implementation are exempt.').toEqual([]);
});
