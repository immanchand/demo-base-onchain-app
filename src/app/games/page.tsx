'use client';
import Navbar from 'src/components/Navbar';



export default function Games() {


  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px] rounded-xl">
      <Navbar />
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        <p>EMPTY GAMES PAGE</p>
      </section>
    </div>
  );
}
