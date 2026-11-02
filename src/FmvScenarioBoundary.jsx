import React from "react";
export default class FmvScenarioBoundary extends React.Component {
  constructor(props){super(props);this.state={failed:false}}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(error,info){console.error("FMV simulator isolated error",error,info?.componentStack)}
  render(){
    if(this.state.failed)return <section className="standings-card card" role="alert"><h2>Simulador temporalmente no disponible</h2><p>Ocurrió un error en el simulador. Las posiciones oficiales siguen disponibles.</p><button type="button" onClick={()=>this.setState({failed:false})}>Reintentar simulador</button></section>;
    return this.props.children;
  }
}
