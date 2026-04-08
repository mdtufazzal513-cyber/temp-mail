// আপনার Render ব্যাকএন্ড URL এখানে দিন ডিপ্লয় করার পর
const BACKEND_URL = "http://localhost:3000"; 

let currentEmail = "";
let currentProvider = "";
let mailToken = "";

// পেজ লোড হলে ইমেইল জেনারেট হবে
window.onload = () => generateNew();

async function generateNew() {
    document.getElementById('email-display').innerText = "Generating...";
    document.getElementById('inbox-container').innerHTML = `<i class="fas fa-spinner fa-spin text-3xl mb-3 text-blue-500"></i><p>Waiting for incoming emails...</p>`;
    
    try {
        const res = await fetch(`${BACKEND_URL}/api/generate-email`);
        const data = await res.json();
        
        if (data.success) {
            currentEmail = data.email;
            currentProvider = data.provider;
            mailToken = data.token || "";
            document.getElementById('email-display').innerText = currentEmail;
            
            // প্রতি ৫ সেকেন্ড পর পর ইনবক্স চেক করবে
            setInterval(checkInbox, 5000);
        }
    } catch (err) {
        document.getElementById('email-display').innerText = "Error fetching email!";
    }
}

async function checkInbox() {
    if (!currentEmail) return;

    try {
        const res = await fetch(`${BACKEND_URL}/api/get-messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentEmail, provider: currentProvider, token: mailToken })
        });
        const data = await res.json();

        if (data.success && data.messages.length > 0) {
            let html = '<div class="divide-y divide-gray-100 text-left">';
            data.messages.forEach(msg => {
                html += `
                <div class="py-3 px-2 hover:bg-gray-50 cursor-pointer rounded">
                    <p class="font-semibold text-gray-800">${msg.subject || 'No Subject'}</p>
                    <p class="text-sm text-gray-500">From: ${msg.from}</p>
                    <p class="text-xs text-gray-400 mt-1">${new Date(msg.date).toLocaleString()}</p>
                </div>`;
            });
            html += '</div>';
            document.getElementById('inbox-container').innerHTML = html;
        }
    } catch (err) {
        console.log("Inbox check failed");
    }
}

function copyEmail() {
    navigator.clipboard.writeText(currentEmail);
    alert("Email copied to clipboard!");
}
