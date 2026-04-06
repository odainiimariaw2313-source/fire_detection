// Initialize chart
window.addEventListener('load', () => {
    const ctx = document.getElementById('stats-chart');
    if (ctx) {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [
                    {
                        label: 'Wildfires',
                        data: [1, 1, 1, 1],
                        borderColor: '#dc2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Alerts',
                        data: [2, 2, 3, 3],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 5
                    }
                }
            }
        });
    }
});