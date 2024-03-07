export const styles = [
  "html, body { margin: 0; height: 100%; }",
  `body { 
    font-family: "Outfit", sans-serif;
    background: #1f1e28; 
    color: #fff;
    display: flex; 
    flex-direction: column;
    font-size: 19px;  
}`,
  `a {
  color: #1effc3;
  text-decoration: none;
}`,
  `
  .social {
    color: rgb(109, 109, 156);
  }

  .social:hover {
    color: #ffffffec;
  }
  `,
  `
  .wrapper {
    width: 704px; margin: 0 auto;
  }
  @media (max-width: 768px) {
    .wrapper {
      width: 100%;
      padding: 0 20px;
    }
  }
  `,
  `
  .blinking_cursor {
    margin-left: 5px;
    -webkit-animation: blinker 1s none infinite;
            animation: blinker 1s none infinite;
    font-size: 28px;
  }@-webkit-keyframes blinker {
    50% {
      opacity: 0; 
    } 
  }@keyframes blinker {
    50% {
      opacity: 0; 
    } 
  }      
  `,
  `
  .dashboard {
    display: flex; 
    flex-direction: row; 
    margin-bottom: 100px;
  }
  @media (max-width: 768px) {
    .dashboard {
      display: flex; 
      flex-direction: column; 
      margin-bottom: 100px;
    }
  }
  
  `,
];
