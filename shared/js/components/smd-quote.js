// <smd-quote>: shared themed card, subscribed to the Quote app's daily selection.
(function(){
  class SmdQuote extends HTMLElement{
    connectedCallback(){
      injectSmdComponentStyle('smd-quote-layout',`
        smd-quote { display:block; min-width:0; flex-shrink:0; }
        smd-quote .smd-quote-card { padding:1rem; }
        body.compact smd-quote .smd-quote-card { padding:.5rem; }
        smd-quote .smd-quote-text { font-size:var(--smd-type-h2,1.25em); line-height:1.3; white-space:pre-wrap; overflow-wrap:anywhere; }
      `);
      if(!this.querySelector('.smd-quote-card')){
        this.innerHTML='<div class="card smd-card smd-quote-card"><blockquote class="m-0"><div class="smd-quote-text fw-bold mb-2"></div><div class="smd-quote-author mb-2"></div></blockquote><div class="smd-quote-credit small"></div></div>';
      }
      this.querySelector('.smd-quote-text').textContent='Loading quote…';
      if(this._unsubscribe)this._unsubscribe();
      this._unsubscribe=SmdQuotes.subscribe(({item})=>{
        if(!this.isConnected)return;
        this.querySelector('.smd-quote-text').textContent=item.q.trim();
        this.querySelector('.smd-quote-author').textContent='— '+(item.a||'Unknown').trim();
        SmdQuotes.credit(this.querySelector('.smd-quote-credit'),item);
      },()=>{if(this.isConnected)this.querySelector('.smd-quote-text').textContent='Quote unavailable. Open Quote to try again.';});
    }
    disconnectedCallback(){if(this._unsubscribe)this._unsubscribe();this._unsubscribe=null;}
  }
  customElements.define('smd-quote',SmdQuote);
})();
