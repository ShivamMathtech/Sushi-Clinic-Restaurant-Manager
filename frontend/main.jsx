import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  state={error:null};
  static getDerivedStateFromError(error){return {error};}
  render(){if(this.state.error)return <div className="startup"><h1>Something went wrong</h1><p>Your saved records are safe. Refresh to reconnect to the application.</p><button className="btn primary" onClick={()=>location.reload()}>Reload application</button></div>;return this.props.children;}
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
