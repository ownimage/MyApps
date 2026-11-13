SmdConfig.storagePrefix = "quote_";
SmdConfig.imagePrefix = "shared-";
SmdConfig.appName = "Quote";

const QUOTE_DEFAULT_FONT = "atkinson";
const QUOTE_FONTS = {
  atkinson: "'Atkinson Hyperlegible Next', Arial, sans-serif",
  inter: "'Inter', Arial, sans-serif", roboto: "'Roboto', Arial, sans-serif",
  lato: "'Lato', Arial, sans-serif", montserrat: "'Montserrat', Arial, sans-serif",
  opensans: "'Open Sans', Arial, sans-serif", sourcesans: "'Source Sans Pro', Arial, sans-serif",
  nunito: "'Nunito', Arial, sans-serif", ubuntu: "'Ubuntu', Arial, sans-serif",
  newscycle: "'News Cycle', Arial, sans-serif", neucha: "'Neucha', cursive",
  cabinsketch: "'Cabin Sketch', cursive", arial: "Arial, Helvetica, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif", times: "'Times New Roman', Times, serif",
  monospace: "Consolas, 'Courier New', monospace"
};
let quoteItems = [];
let quoteState = null;

function quoteFont() {
  const value = localStorage.getItem(smdKey("textFont"));
  return Object.prototype.hasOwnProperty.call(QUOTE_FONTS, value) ? value : QUOTE_DEFAULT_FONT;
}
function changeQuoteFont(value) {
  const font = Object.prototype.hasOwnProperty.call(QUOTE_FONTS, value) ? value : QUOTE_DEFAULT_FONT;
  localStorage.setItem(smdKey("textFont"), font);
  document.getElementById("quoteDisplay").setAttribute("font-family", QUOTE_FONTS[font]);
}

// Local calendar dates, represented as consecutive integers. Never divide
// elapsed local milliseconds by 24 hours: DST days can be 23 or 25 hours.
function quoteDayNumber(date) { return SmdQuotes.dayNumber(date); }
function quoteSyncDay() { return SmdQuotes.sync(); }
function renderQuote() {
  if(!quoteState||!quoteItems.length)return;
  const item=quoteItems[quoteState.counter%quoteItems.length];
  const display=document.getElementById('quoteDisplay');
  display.lines=[{text:item.q.trim(),weight:700},{text:'— '+(item.a||'Unknown').trim(),scale:.45,weight:400,gap:.65}];
  display.hidden=false;
  SmdQuotes.credit(document.getElementById('quoteCredit'),item);
  document.getElementById('quoteCredit').hidden=false;
  document.getElementById('quoteStatus').hidden=true;
}
function quoteLoadError() {
  const status=document.getElementById('quoteStatus');status.hidden=false;
  status.textContent='Unable to load quotes. Choose Change quote from the menu to try again.';
}
function loadQuotes() { return SmdQuotes.load().catch(quoteLoadError); }
function changeQuote() { return SmdQuotes.next().catch(quoteLoadError); }
function openSettings() {
  smdSetupSettingsPage({
    dangerIds: ["noCacheRow", "refreshAppRow", "clearAllDataRow"],
    restore: function () { document.getElementById("quoteFont").value = quoteFont(); }
  });
}
function closeSettings() { smdHideSettingsPage(); document.getElementById("quoteDisplay").fit(); }
function changeShowDanger(enabled) { smdChangeShowDanger(enabled, ["noCacheRow", "refreshAppRow", "clearAllDataRow"]); }
function confirmClearAllData() {
  smdConfirmClearAllData({content: "Clear Quote settings and reset the daily quote counter?", onClear: function () { location.reload(); }});
}
document.addEventListener("DOMContentLoaded", function () {
  applyTheme(getStoredTheme());
  document.getElementById("quoteDisplay").setAttribute("font-family", QUOTE_FONTS[quoteFont()]);
  SmdQuotes.subscribe(({items,state})=>{quoteItems=items;quoteState=state;renderQuote();},quoteLoadError);
});
