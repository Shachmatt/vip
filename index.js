const xValues = [50,60,70,80,90,100,110,120,130,140,150];
const yValues = [7,8,8,9,9,9,10,11,14,14,15];

let daysBefore = 100;
let xee = [];
let yee= [];
let currentValue = 100;


function logistical (x) {
   var y = 3.99999*x* (1-x) 
   return y;
}

function minusDays(days) {
  const today = new Date();
  const result = new Date(today);
    result.setDate(result.getDate() - days);

  const day = result.getDate();
  const month = result.getMonth() + 1;
  return `${day}. ${month}.`;
}


function starter () {
var t= Math.random();
var datum = minusDays(daysBefore);
xee.push(datum);
currentValue= currentValue*0.95 + 0.1*currentValue*t
yee.push(currentValue);

var e=1
for(var i=0; i<daysBefore; i++) {
    e = logistical(t);
currentValue= currentValue*0.90 + 0.2*currentValue*t
yee.push(currentValue);    t=e;
    xee.push(minusDays(daysBefore-i-1));
}
}
starter();

let max = Math.max(...yee);
let rounder = Math.ceil(max/100)*100

new Chart("first", {
  type: "line",
  data: {
    labels: xee,
    datasets: [{
      fill: false,
      tension: 0, // 'lineTension' was renamed to 'tension'
      backgroundColor: "#850F8D",
      borderColor: "#850F8D",
      data: yee,
      color: "#850F8D"
    }]
  },
  options: {
    plugins: {
      title: {
        display: true,
        text: "Investigo a. s.",
        color: "#850f8d",
        font: {
          size: 30
        }
        
      },
      legend: { display: false,
        labels: {
            color: "#850f8d"
        } 

      }
    },
    scales: {
      y: { // no yAxes array anymore
        ticks: {color: "#850F8D"},
        grid: {
          color: "#850f8d48"
        }
      },
      x: {
        ticks: {color: "#850F8D"},

        grid: {
            display: false
        }
      }
    }
  }
});
