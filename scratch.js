const res = await fetch("http://localhost:3000/api/auth/me", {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    "Cookie": "access_token=dev-citizen" // I don't know the exact token, let's see how authentication works in the mock/dev env
  },
  body: JSON.stringify({
    name: "Ayesha Siddika Test",
    email: "ayesha@example.com",
    profileDetails: {
      nameBn: "আয়েশা",
      occupation: "Teacher"
    }
  })
});
console.log(res.status);
console.log(await res.text());
