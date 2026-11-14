// SolarControlar - Now tab: the latest signed power flows in watts.
function renderPowerTab() {
  var container = $id('tab-power');
  if (!container) return;
  if (!_solarMainData) {
    container.innerHTML = '<p class="loading text-body fst-italic mb-0">Loading power data...</p>';
    return;
  }
  var diagram = container.querySelector('solar-diagram');
  if (!diagram) {
    container.textContent = '';
    diagram = document.createElement('solar-diagram');
    container.appendChild(diagram);
  }
  diagram.flows = _solarMainData;
  diagram.status = _solarMainData.status;
}
