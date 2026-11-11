// Cumulative energy history is projected on the server; only one period travels.
var _energyInitialized = false;
var _energyChart = null;
var _energyRequest = 0;
var ENERGY_SERIES = {
  grid_import: {label: 'Grid Import', color: '--solar-series-grid'},
  grid_export: {label: 'Grid Export', color: '--solar-series-battery'},
  ac_charge: {label: 'AC Charge', color: '--solar-series-battery-level'},
  solar: {label: 'Solar', color: '--solar-series-solar'},
  usage: {label: 'Usage', color: '--solar-series-home'}
};
var SOLAR_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function energyCalendarAxis(period, value) {
  if (period === 'day') {
    var axis = solarDayAxis();
    axis.title.text = value.slice(8,10) + ' ' + SOLAR_MONTH_NAMES[Number(value.slice(5,7)) - 1] + ' ' + value.slice(0,4);
    return axis;
  }
  return {
    type: 'category',
    ticks: {
      autoSkip: false, maxRotation: 90,
      callback: function (index) {
        var label = this.getLabelForValue(index);
        var number = Number(label.slice(-2));
        return period === 'month' ? String(number) : SOLAR_MONTH_NAMES[number - 1];
      }
    },
    grid: {},
    title: { display: true, text: period === 'year' ? value : SOLAR_MONTH_NAMES[Number(value.slice(5,7)) - 1] + ' ' + value.slice(0,4) }
  };
}
function initEnergyTab() {
  if (_energyInitialized) return;
  _energyInitialized = true;
  var container = $id('tab-kwh');
  container.innerHTML = '<div class="graph-controls d-flex flex-wrap align-items-center gap-3 mb-3">' +
    '<label class="form-label mb-0" for="energy-period">Period:</label>' +
    '<smd-select id="energy-period" class="w-auto log-select" onchange="loadEnergyValues()"></smd-select>' +
    '<label class="form-label mb-0" id="energy-value-label" for="energy-value">Day:</label>' +
    '<smd-select id="energy-value" class="w-auto log-select" onchange="loadEnergyData()"></smd-select>' +
    '<div class="graph-checkboxes d-flex flex-wrap align-items-center gap-3">' +
    Object.keys(ENERGY_SERIES).map(function(key) {
      return '<smd-checkbox class="energy-series" value="'+key+'" checked>'+ENERGY_SERIES[key].label+'</smd-checkbox>';
    }).join('') + '</div></div>' +
    '<div class="graph-wrap bg-body border rounded p-3 position-relative">' +
    '<canvas id="energyChart" class="w-100" hidden></canvas>' +
    '<p id="energy-status" role="status" class="text-body fst-italic mb-0"></p></div>';
  var period = $id('energy-period');
  period.options = [{value:'day',label:'Day'},{value:'month',label:'Month'},{value:'year',label:'Year'}];
  period.value = 'day';
  container.querySelectorAll('.energy-series').forEach(function(cb,index) {
    // Listen on the native change bubbling out of the shared component once.
    cb.addEventListener('change',function(event) {
      if (event.detail || !_energyChart) return;
      _energyChart.setDatasetVisibility(index, cb.checked);
      _energyChart.update('none');
    });
  });
  ['bootstrap-theme-css','theme-override-mode','theme-override-specific'].forEach(function(id) {
    var sheet=$id(id);if(sheet)sheet.addEventListener('load',refreshEnergyColors);
  });
  new MutationObserver(refreshEnergyColors).observe(document.documentElement,{attributes:true,attributeFilter:['data-bs-theme','data-theme']});
  document.addEventListener('smd-theme-change',refreshEnergyColors);
  loadEnergyValues();
}
function energyStatus(text) {
  if (_energyChart) { _energyChart.destroy(); _energyChart=null; }
  $id('energyChart').hidden=true;
  var status=$id('energy-status');status.textContent=text;status.hidden=false;
}
async function loadEnergyValues() {
  var request=++_energyRequest;
  var period=$id('energy-period').value;
  var select=$id('energy-value');
  $id('energy-value-label').textContent={day:'Day:',month:'Month:',year:'Year:'}[period];
  select.disabled=true;select.options=[];select.value='';
  energyStatus('Loading available periods…');
  try {
    var data=await solarApi.getEnergyValues(period);
    if(request!==_energyRequest)return;
    var values=data.values||[];
    if(!values.length){energyStatus('No energy data available for this period.');return;}
    select.options=values.map(function(value){return {value:value,label:value};});
    select.value=values[0];select.disabled=false;
    loadEnergyData();
  } catch(error) {
    if(request===_energyRequest)energyStatus('Unable to load available periods. Choose a period to try again.');
  }
}
async function loadEnergyData() {
  var request=++_energyRequest;
  var period=$id('energy-period').value,value=$id('energy-value').value;
  if(!value)return;
  energyStatus('Loading energy data…');
  try {
    var data=await solarApi.getEnergyData(period,value);
    if(request!==_energyRequest)return;
    var keys=Object.keys(ENERGY_SERIES);
    if(!data.labels.length || !keys.some(function(key){return (data.series[key]||[]).some(function(v){return v!==null;});})) {
      energyStatus('No energy data available for this period.');return;
    }
    $id('energy-status').hidden=true;$id('energyChart').hidden=false;
    // Scale from the latest available reading in each of the five series,
    // including hidden series. Skip empty future calendar slots, not to zero.
    // suggestedMax lets Chart.js round up to readable tick intervals.
    var maximum = 0;
    keys.forEach(function(key) {
      var values = data.series[key] || [];
      for (var i = values.length - 1; i >= 0; i--) {
        if (Number.isFinite(values[i])) {
          maximum = Math.max(maximum, values[i]);
          break;
        }
      }
    });
    var controls=$id('tab-kwh').querySelectorAll('.energy-series');
    _energyChart=new Chart($id('energyChart').getContext('2d'),{
      type:'line',
      data:{labels:data.labels,datasets:keys.map(function(key,index){
        var color=resolveSeriesColor(ENERGY_SERIES[key].color);
        return {label:ENERGY_SERIES[key].label,data:period === 'day' ? data.labels.map(function(label,index) {
          var parts=label.split(':');
          return {x:Number(parts[0])*60+Number(parts[1]),y:data.series[key][index]};
        }) : data.series[key],borderColor:color,backgroundColor:color,
          borderWidth:2,pointRadius:0,pointHoverRadius:2,spanGaps:false,tension:0,hidden:!controls[index].checked};
      })},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{tooltip:{callbacks:{title:function(items){return items.length ? (period==='day' ? solarTimeLabel(items[0].parsed.x) : items[0].label) : '';}}},legend:{labels:{color:resolveSeriesColor('--bs-body-color')},onClick:function(event,item,legend){
          var index=item.datasetIndex,visible=legend.chart.isDatasetVisible(index);
          legend.chart.setDatasetVisibility(index,!visible);controls[index].checked=!visible;legend.chart.update('none');
        }}},
        scales:{x:energyCalendarAxis(period,value),
          y:{type:'linear',beginAtZero:true,suggestedMax:maximum,ticks:{callback:function(v){return v+' kWh';}},grid:{},title:{display:true,text:'Energy (kWh)'}}}
      }
    });
    refreshEnergyColors();
  } catch(error) {
    if(request===_energyRequest)energyStatus('Unable to load energy data. Choose a period to try again.');
  }
}
function refreshEnergyColors() {
  if(!_energyChart)return;
  var keys=Object.keys(ENERGY_SERIES),ink=resolveSeriesColor('--bs-body-color');
  _energyChart.data.datasets.forEach(function(ds,index){ds.borderColor=ds.backgroundColor=resolveSeriesColor(ENERGY_SERIES[keys[index]].color);});
  _energyChart.options.color=ink;_energyChart.options.plugins.legend.labels.color=ink;
  Object.keys(_energyChart.options.scales).forEach(function(key){
    var scale=_energyChart.options.scales[key];
    scale.ticks.color=ink;scale.title.color=ink;
    scale.grid.color=key==='x' && scale.type==='linear' ? solarDayGridColor : resolveSeriesColor('--bs-border-color');
  });
  _energyChart.update('none');
}
