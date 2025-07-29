const xValues = [50,60,70,80,90,100,110,120,130,140,150];
const yValues = [7,8,8,9,9,9,10,11,14,14,15];

let daysBefore = 200;
let xee = [];
let yee= [];
let currentValue = 100;
var t= Math.random();
let x = [];
let y = [];



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
var datum = minusDays(daysBefore-1);
xee.push(datum);
currentValue= currentValue*0.95 + 0.1*currentValue*t
yee.push(currentValue);

var e=1
for(var i=0; i<daysBefore-1; i++) {
    e = logistical(t);
currentValue= currentValue*0.90 + 0.2*currentValue*t
yee.push(currentValue);    t=e;
    xee.push(minusDays(daysBefore-i-2));
}
x= xee;
y = yee;
document.getElementById(x.length).classList.add("active")
}
starter();
let max = Math.max(...yee);
let rounder = Math.ceil(max/100)*100






let chart = new Chart("first", {
  type: "line",
  data: {
    labels: x,
    datasets: [{
      fill: false,
      tension: 0, // 'lineTension' was renamed to 'tension'
      backgroundColor: "#850F8D",
      borderColor: "#850F8D",
      data: y,
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







function slicer(numero) {
var ys= yee.slice(-numero)
var xs= xee.slice(-numero)
y = ys;
x= xs
document.querySelectorAll(".flex-container *").forEach ((element)=>{
  element.classList.remove("active")
})
document.getElementById(numero).classList.add("active");
 chart.data.labels = x;
    chart.data.datasets[0].data = y;
    chart.update();

};
document.querySelectorAll(".flexer").forEach ((element)=>{
element.addEventListener("click", () => slicer(element.id))



})


slicer(100)


