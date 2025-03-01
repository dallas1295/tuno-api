import "jsr:@std/dotenv/load";

function gogogo() {
  try {
    console.log("this is the db name: ", Deno.env.get("MONGO_DB"));
  } catch (error) {
    console.log("somehting's wrong: ", error);
    throw error;
  }
}

gogogo();
