const fs = require('fs');
const path = require('path');
// The development static server indexes files once. Serve the edited editor
// sources from disk so an already-running preview cannot truncate new JS.
async function routeEditorSources(page) {
  await page.route('**/css/themes/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).split('/css/themes/')[1];
    const file = path.join(__dirname,'../shared/css/themes',relative || '');
    if (!relative || !fs.existsSync(file)) return route.continue();
    return route.fulfill({contentType:'text/css',body:fs.readFileSync(file,'utf8')});
  });
  await page.route(/\/(ListOfLists\/js\/list-editor|PlanMyDay\/js\/job-editor)\.js(?:\?|$)/, route => {
    const relative = new URL(route.request().url()).pathname.slice(1);
    return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'..',relative),'utf8')});
  });
}
const buttonPaint = locator => locator.evaluate(el => {
  const style = getComputedStyle(el);
  return Object.fromEntries(['color','backgroundColor','backgroundImage','borderColor','boxShadow','transform'].map(p => [p,style[p]]));
});
module.exports = {routeEditorSources,buttonPaint};
